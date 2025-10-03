import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PKCE helper functions
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map(x => charset[x % charset.length])
    .join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach(byte => str += String.fromCharCode(byte));
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-start] Initiating Tesla OAuth flow with PKCE');
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[tesla-start] ERROR: missing_authorization_header');
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-start] ERROR: user_not_authenticated', userError);
      throw new Error('User not authenticated');
    }

    console.log('[tesla-start] User authenticated:', user.id);

    // Generate PKCE parameters
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(128);
    const codeChallenge = base64urlencode(await sha256(codeVerifier));

    console.log('[tesla-start] Generated PKCE parameters:', {
      state: state.substring(0, 10) + '...',
      codeVerifier: codeVerifier.substring(0, 10) + '...',
      codeChallenge: codeChallenge.substring(0, 10) + '...',
    });

    // Store state and verifier in database
    const { error: dbError } = await supabase
      .from('oauth_pkce_state')
      .insert({
        nonce: state,
        code_verifier: codeVerifier,
        user_id: user.id,
      });

    if (dbError) {
      console.error('[tesla-start] ERROR: failed_to_store_pkce_state', dbError);
      throw new Error('Failed to store PKCE state: ' + dbError.message);
    }

    console.log('[tesla-start] PKCE state stored successfully');

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    if (!clientId) {
      console.error('[tesla-start] ERROR: tesla_client_id_not_configured');
      throw new Error('Tesla Client ID not configured');
    }

    const redirectUri = 'https://kmtrack.nl/oauth2callback';
    
    // Build authorization URL
    const authUrl = new URL('https://auth.tesla.com/oauth2/v3/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    console.log('[tesla-start] SUCCESS: Redirecting to Tesla authorization');
    console.log('[tesla-start] Auth URL generated:', {
      clientId: clientId.substring(0, 10) + '...',
      redirectUri,
      state: state.substring(0, 10) + '...',
    });

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state: state
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[tesla-start] FATAL_ERROR:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
