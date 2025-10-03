import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, state } = await req.json();
    console.log('[tesla-auth] Received callback:', {
      hasCode: !!code,
      hasState: !!state,
      state: state?.substring(0, 10) + '...',
    });

    if (!code) {
      console.error('[tesla-auth] ERROR: missing_code');
      throw new Error('No authorization code provided');
    }

    if (!state) {
      console.error('[tesla-auth] ERROR: missing_state');
      throw new Error('No state provided');
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[tesla-auth] ERROR: missing_authorization_header');
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-auth] ERROR: user_not_authenticated', userError);
      throw new Error('User not authenticated');
    }

    console.log('[tesla-auth] User authenticated:', user.id);

    // Retrieve and validate PKCE state
    const { data: pkceData, error: pkceError } = await supabase
      .from('oauth_pkce_state')
      .select('code_verifier, user_id')
      .eq('nonce', state)
      .eq('user_id', user.id)
      .single();

    if (pkceError || !pkceData) {
      console.error('[tesla-auth] ERROR: invalid_or_expired_state', {
        error: pkceError,
        hasData: !!pkceData,
      });
      throw new Error('Invalid or expired state parameter');
    }

    console.log('[tesla-auth] PKCE state validated successfully');

    const codeVerifier = pkceData.code_verifier;

    // Delete used state immediately
    await supabase
      .from('oauth_pkce_state')
      .delete()
      .eq('nonce', state);

    console.log('[tesla-auth] Used PKCE state deleted');

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const redirectUri = 'https://kmtrack.nl/oauth2callback';

    if (!clientId || !clientSecret) {
      console.error('[tesla-auth] ERROR: tesla_credentials_not_configured');
      throw new Error('Tesla credentials not configured');
    }

    // Exchange authorization code for access token with PKCE
    console.log('[tesla-auth] Exchanging code for tokens with PKCE...');
    const tokenResponse = await fetch('https://auth.tesla.com/oauth2/v3/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[tesla-auth] ERROR: token_exchange_failed', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
      });
      throw new Error(`Failed to exchange code: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[tesla-auth] SUCCESS: Received tokens from Tesla');

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    console.log('[tesla-auth] Storing tokens for user:', user.id);

    // Store tokens using the secure vault function
    const { error: storeError } = await supabase.rpc('store_tesla_tokens', {
      p_user_id: user.id,
      p_access_token: tokenData.access_token,
      p_refresh_token: tokenData.refresh_token,
      p_expires_at: expiresAt.toISOString(),
    });

    if (storeError) {
      console.error('[tesla-auth] ERROR: failed_to_store_tokens', storeError);
      throw storeError;
    }

    console.log('[tesla-auth] SUCCESS: Tesla tokens stored successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Tesla account connected successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-auth] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
