// supabase/functions/tesla-oauth/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const env = Deno.env.toObject()
const {
  TESLA_CLIENT_ID,
  TESLA_CLIENT_SECRET,
  TESLA_REDIRECT_URI,
  TESLA_AUTH_HOST,
  TESLA_TOKEN_PATH,
  TESLA_AUTHORIZE_PATH,
  VITE_PUBLIC_BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env")
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

function b64url(bytes: Uint8Array) {
  const str = Array.from(bytes).map((b) => String.fromCharCode(b)).join("")
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function pkce() {
  const ver = crypto.getRandomValues(new Uint8Array(32))
  const verifier = b64url(ver)
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const challenge = b64url(new Uint8Array(digest))
  return { verifier, challenge }
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const path = url.pathname

    if (req.method === "GET" && path.endsWith("/authorize")) {
      const { challenge, verifier } = await pkce()
      const state = crypto.randomUUID()

      const { error } = await supabase
        .from("oauth_states")
        .insert({ provider: "tesla", state, pkce_verifier: verifier })

      if (error) {
        console.error("store-state-error", error)
        return new Response("state-store-failed", { status: 500 })
      }

      const authUrl = new URL(TESLA_AUTHORIZE_PATH!, TESLA_AUTH_HOST!)
      authUrl.searchParams.set("client_id", TESLA_CLIENT_ID!)
      authUrl.searchParams.set("code_challenge", challenge)
      authUrl.searchParams.set("code_challenge_method", "S256")
      authUrl.searchParams.set("redirect_uri", TESLA_REDIRECT_URI!)
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("scope", "openid offline_access user_data vehicle_device_data vehicle_location")
      authUrl.searchParams.set("state", state)

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { "content-type": "application/json" },
      })
    }

    if (req.method === "GET" && path.endsWith("/callback")) {
      const query = new URL(req.url).searchParams
      const code = query.get("code")
      const state = query.get("state")
      if (!code || !state) return new Response("missing-code-or-state", { status: 400 })

      const { data: st, error: stErr } = await supabase
        .from("oauth_states")
        .select("id, pkce_verifier")
        .eq("provider", "tesla")
        .eq("state", state)
        .single()

      if (stErr || !st) {
        console.error("invalid-state", stErr)
        return new Response("invalid-state", { status: 400 })
      }

      const tokenUrl = new URL(TESLA_TOKEN_PATH!, TESLA_AUTH_HOST!)
      const body = {
        grant_type: "authorization_code",
        client_id: TESLA_CLIENT_ID!,
        client_secret: TESLA_CLIENT_SECRET!,
        code,
        code_verifier: st.pkce_verifier,
        redirect_uri: TESLA_REDIRECT_URI!,
      }

      const r = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const text = await r.text()
        console.error("token-exchange-failed", text)
        return new Response(`token-exchange-failed: ${text}`, { status: 500 })
      }

      const tokens = await r.json() as {
        access_token: string; refresh_token: string; expires_in: number; id_token?: string
      }

      // Authenticate user in Supabase based on Authorization header passed from client (cookie/bearer)
      const authHeader = req.headers.get("Authorization") ?? ""
      const supabaseAuth = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userInfo } = await supabaseAuth.auth.getUser()
      const userId = userInfo?.user?.id ?? null
      if (!userId) return new Response("no-signed-in-user", { status: 401 })

      const { error: upsertErr } = await supabase
        .from("tesla_tokens")
        .upsert({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          fetched_at: new Date().toISOString(),
          expires_in: tokens.expires_in,
        }, { onConflict: "user_id" })

      if (upsertErr) {
        console.error("token-store-failed", upsertErr)
        return new Response("token-store-failed", { status: 500 })
      }

      await supabase.from("oauth_states").delete().eq("id", st.id)

      return Response.redirect(`${VITE_PUBLIC_BASE_URL}/settings?connected=tesla`, 302)
    }

    return new Response("not-found", { status: 404 })
  } catch (e) {
    console.error("unhandled", e)
    return new Response("internal-error", { status: 500 })
  }
})
