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
    console.log('[tesla-auth] Starting token exchange');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-auth] User not authenticated:', userError);
      throw new Error('User not authenticated');
    }

    console.log('[tesla-auth] User authenticated:', user.id);

    const { code, state } = await req.json();
    if (!code || !state) {
      throw new Error('Missing code or state');
    }

    console.log('[tesla-auth] Retrieving PKCE state');

    // Get PKCE verifier
    const { data: pkceData, error: pkceError } = await supabase
      .from('oauth_pkce_state')
      .select('code_verifier')
      .eq('nonce', state)
      .eq('user_id', user.id)
      .single();

    if (pkceError || !pkceData) {
      console.error('[tesla-auth] Invalid state:', pkceError);
      throw new Error('Invalid state');
    }

    console.log('[tesla-auth] PKCE state found, exchanging code for tokens');

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      throw new Error('Tesla credentials not configured');
    }

    // Get the origin from the request to build the redirect URI dynamically
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/') || 'https://kmtrack.nl';
    const redirectUri = `${origin}/oauth2callback`;
    
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
      console.error('[tesla-auth] Token exchange failed:', errorText);
      throw new Error('Token exchange failed: ' + errorText);
    }

    const tokens = await tokenResponse.json();
    console.log('[tesla-auth] Tokens received');

    // Store tokens using the secure function
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    
    const { error: storeError } = await supabase.rpc('store_tesla_tokens', {
      p_user_id: user.id,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_at: expiresAt,
    });

    if (storeError) {
      console.error('[tesla-auth] Failed to store tokens:', storeError);
      throw new Error('Failed to store tokens');
    }

    console.log('[tesla-auth] Tokens stored successfully');

    // Clean up PKCE state
    await supabase
      .from('oauth_pkce_state')
      .delete()
      .eq('nonce', state)
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-auth] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
