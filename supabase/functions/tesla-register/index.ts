import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-register] Starting Tesla account registration for Europe region');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: 'missing_authorization',
          message: 'Geen autorisatie header'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[tesla-register] Auth error:', authError);
      return new Response(
        JSON.stringify({ 
          error: 'not_authenticated',
          message: 'Gebruiker niet geauthenticeerd'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-register] User authenticated:', user.id);

    // Get Tesla credentials
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const teslaApiBase = Deno.env.get('TESLA_FLEET_API_BASE_URL') || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ 
          error: 'configuration_error',
          message: 'Tesla credentials niet geconfigureerd'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-register] Configuration:', {
      teslaApiBase,
      clientIdPrefix: clientId.substring(0, 10) + '...',
    });

    // Get client credentials access token
    console.log('[tesla-register] Requesting client credentials token...');
    
    const tokenUrl = 'https://auth.tesla.com/oauth2/v3/token';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
        audience: teslaApiBase,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('[tesla-register] Token error:', tokenResponse.status, tokenError);
      return new Response(
        JSON.stringify({ 
          error: 'token_failed',
          message: 'Kon geen toegangstoken verkrijgen voor registratie',
          details: tokenError
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('[tesla-register] No access token in response');
      return new Response(
        JSON.stringify({ 
          error: 'no_token',
          message: 'Geen toegangstoken ontvangen'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-register] Got access token, calling register API with retry logic...');
    
    const registerUrl = `${teslaApiBase}/api/1/partner_accounts`;
    let lastError = null;

    // Retry loop
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[tesla-register] Attempt ${attempt}/${MAX_RETRIES} - POST to:`, registerUrl);
        
        const registerResponse = await fetch(registerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            domain: 'kmtrack.nl'
          })
        });

        const responseText = await registerResponse.text();
        console.log(`[tesla-register] Attempt ${attempt} - Status:`, registerResponse.status);
        console.log(`[tesla-register] Attempt ${attempt} - Response:`, responseText);

        let registerData;
        try {
          registerData = JSON.parse(responseText);
        } catch (e) {
          registerData = { raw: responseText };
        }

        // Success cases
        if (registerResponse.ok) {
          console.log('[tesla-register] SUCCESS: Account registered for Europe region');
          return new Response(
            JSON.stringify({ 
              success: true,
              message: 'Tesla account succesvol geregistreerd voor Europa regio',
              data: registerData,
              attempt
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Already registered - also success
        if (responseText.includes('already registered') || 
            responseText.includes('Account already exists') ||
            registerResponse.status === 409) {
          console.log('[tesla-register] Account already registered, treating as success');
          return new Response(
            JSON.stringify({ 
              success: true,
              message: 'Account is al geregistreerd voor Europa regio',
              alreadyRegistered: true,
              attempt
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Transient error - retry
        if (registerResponse.status >= 500 || registerResponse.status === 429) {
          lastError = `Status ${registerResponse.status}: ${responseText}`;
          console.log(`[tesla-register] Transient error on attempt ${attempt}, will retry...`);
          
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
            continue;
          }
        }

        // Permanent error
        console.error('[tesla-register] Registration failed permanently:', registerData);
        return new Response(
          JSON.stringify({ 
            error: 'registration_failed',
            message: 'Registratie mislukt bij Tesla',
            details: responseText,
            status: registerResponse.status,
            attempt
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
        console.error(`[tesla-register] Fetch error on attempt ${attempt}:`, lastError);
        
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
      }
    }

    // All retries exhausted
    console.error('[tesla-register] All retry attempts exhausted');
    return new Response(
      JSON.stringify({ 
        error: 'registration_failed_after_retries',
        message: 'Registratie mislukt na meerdere pogingen',
        details: lastError,
        attempts: MAX_RETRIES
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-register] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Er ging iets mis bij het registreren',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});