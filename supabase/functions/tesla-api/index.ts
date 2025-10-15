import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TESLA_FLEET_API_HOST,
        TESLA_CLIENT_ID, TESLA_CLIENT_SECRET, TESLA_AUTH_HOST, TESLA_TOKEN_PATH } = Deno.env.toObject()

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

serve(async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === "GET" && path.endsWith("/vehicles")) {
    const authHeader = req.headers.get("Authorization") ?? ""
    const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await sb.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return new Response("unauthorized", { status: 401 })

    const { data: tok } = await supabase.from("tesla_tokens").select("*").eq("user_id", uid).single()
    if (!tok) return new Response("not-connected", { status: 400 })

    const fleetUrl = new URL("/api/1/vehicles", TESLA_FLEET_API_HOST!)
    let r = await fetch(fleetUrl.toString(), { headers: { Authorization: `Bearer ${tok.access_token}` } })

    if (r.status === 401) {
      const ok = await refresh(uid, tok.refresh_token)
      if (!ok) return new Response("refresh-failed", { status: 401 })
      const { data: tok2 } = await supabase.from("tesla_tokens").select("*").eq("user_id", uid).single()
      r = await fetch(fleetUrl.toString(), { headers: { Authorization: `Bearer ${tok2.access_token}` } })
    }

    const json = await r.json()
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } })
  }

  return new Response("not-found", { status: 404 })
})

async function refresh(userId: string, refreshToken: string) {
  const tokenUrl = new URL(TESLA_TOKEN_PATH!, TESLA_AUTH_HOST!)
  const r = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: TESLA_CLIENT_ID!,
      client_secret: TESLA_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  })
  if (!r.ok) return false
  const t = await r.json()
  const { error } = await supabase.from("tesla_tokens").upsert({
    user_id: userId,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? refreshToken,
    expires_in: t.expires_in ?? 0,
    fetched_at: new Date().toISOString(),
  }, { onConflict: "user_id" })
  return !error
}
