import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-auth] Starting token exchange');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: 'missing_authorization',
          message: 'Geen autorisatie header gevonden'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-auth] User not authenticated:', userError);
      return new Response(
        JSON.stringify({ 
          error: 'not_authenticated',
          message: 'Gebruiker niet geauthenticeerd'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-auth] User authenticated:', user.id);

    const { code, state } = await req.json();
    
    if (!code) {
      return new Response(
        JSON.stringify({ 
          error: 'missing_code',
          message: 'Geen autorisatie code ontvangen van Tesla'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!state) {
      return new Response(
        JSON.stringify({ 
          error: 'missing_state',
          message: 'Geen state parameter ontvangen'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-auth] Retrieving PKCE state for state:', state.substring(0, 10) + '...');

    // Get PKCE verifier and DELETE immediately to prevent duplicate processing
    const { data: pkceData, error: pkceError } = await supabase
      .from('oauth_pkce_state')
      .select('code_verifier, created_at')
      .eq('nonce', state)
      .eq('user_id', user.id)
      .single();

    if (pkceError || !pkceData) {
      console.error('[tesla-auth] Invalid state - not found in database:', pkceError);
      return new Response(
        JSON.stringify({ 
          error: 'invalid_state',
          message: 'Ongeldige OAuth staat. Mogelijk is deze al gebruikt of verlopen. Probeer opnieuw te verbinden.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Delete PKCE state IMMEDIATELY to prevent duplicate processing
    const { error: deleteError } = await supabase
      .from('oauth_pkce_state')
      .delete()
      .eq('nonce', state)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[tesla-auth] Failed to delete PKCE state:', deleteError);
      // Continue anyway, token exchange is more important
    } else {
      console.log('[tesla-auth] PKCE state deleted to prevent duplicate processing');
    }

    // Check if PKCE state is not too old (max 1 hour)
    const stateAge = Date.now() - new Date(pkceData.created_at).getTime();
    if (stateAge > 60 * 60 * 1000) {
      console.error('[tesla-auth] PKCE state too old:', stateAge / 1000, 'seconds');
      return new Response(
        JSON.stringify({ 
          error: 'expired_state',
          message: 'OAuth staat is verlopen. Probeer opnieuw te verbinden.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-auth] PKCE state valid, exchanging code for tokens');

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ 
          error: 'configuration_error',
          message: 'Tesla credentials niet geconfigureerd'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use fixed redirect URI to match Tesla Developer Console configuration
    const redirectUri = 'https://kmtrack.nl/oauth2callback';
    
    console.log('[tesla-auth] Using redirect URI:', redirectUri);

    // Exchange code for tokens
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
        code_verifier: pkceData.code_verifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[tesla-auth] Token exchange failed:', tokenResponse.status, errorText);
      
      let userMessage = 'Token uitwisseling mislukt';
      if (errorText.includes('invalid_grant') || errorText.includes('invalid_code')) {
        userMessage = 'Ongeldige autorisatie code. Mogelijk is deze al gebruikt. Probeer opnieuw te verbinden.';
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'token_exchange_failed',
          message: userMessage,
          details: errorText
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokens = await tokenResponse.json();
    console.log('[tesla-auth] Tokens received successfully');

    // Validate tokens
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[tesla-auth] Invalid tokens received - missing access or refresh token');
      return new Response(
        JSON.stringify({ 
          error: 'invalid_tokens',
          message: 'Ongeldige tokens ontvangen van Tesla'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store tokens using the secure encrypted function
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    
    console.log('[tesla-auth] Encrypting and storing tokens with expiry:', expiresAt);

    // Encrypt tokens before storage
    const encryptedAccessToken = await encryptToken(tokens.access_token);
    const encryptedRefreshToken = await encryptToken(tokens.refresh_token);

    const { error: storeError } = await supabase.rpc('store_encrypted_tesla_tokens', {
      p_user_id: user.id,
      p_encrypted_access_token: encryptedAccessToken,
      p_encrypted_refresh_token: encryptedRefreshToken,
      p_expires_at: expiresAt
    });

    if (storeError) {
      console.error('[tesla-auth] Failed to store tokens:', storeError);
      return new Response(
        JSON.stringify({ 
          error: 'storage_failed',
          message: 'Kon tokens niet opslaan in database'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-auth] SUCCESS: Tokens stored successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Tesla account succesvol verbonden'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-auth] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Er ging iets mis bij het autoriseren',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});