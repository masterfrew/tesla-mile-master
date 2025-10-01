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
    const { code } = await req.json();
    console.log('Received authorization code for Tesla OAuth');

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    // Must match the exact redirect URI used in the OAuth authorization request
    const redirectUri = 'https://kmtrack.nl/oauth2callback';

    if (!clientId || !clientSecret) {
      throw new Error('Tesla credentials not configured');
    }

    // Exchange authorization code for access token
    console.log('Exchanging code for tokens...');
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
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Tesla token exchange failed:', errorText);
      throw new Error(`Failed to exchange code: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Successfully received tokens from Tesla');

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Failed to get user:', userError);
      throw new Error('User not authenticated');
    }

    console.log('Storing tokens for user:', user.id);

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens using the secure vault function
    const { error: storeError } = await supabase.rpc('store_tesla_tokens', {
      p_user_id: user.id,
      p_access_token: tokenData.access_token,
      p_refresh_token: tokenData.refresh_token,
      p_expires_at: expiresAt.toISOString(),
    });

    if (storeError) {
      console.error('Failed to store tokens:', storeError);
      throw storeError;
    }

    console.log('Successfully stored Tesla tokens');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Tesla account connected successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tesla-auth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
