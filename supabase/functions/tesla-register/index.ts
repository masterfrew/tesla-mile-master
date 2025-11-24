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
    console.log('[tesla-register] Starting Tesla account registration for Europe region');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[tesla-register] Auth error:', authError);
      throw new Error('Unauthorized');
    }

    console.log('[tesla-register] User authenticated:', user.id);

    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const teslaApiBase = Deno.env.get('TESLA_FLEET_API_BASE_URL') || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    if (!clientId || !clientSecret) {
      throw new Error('Tesla credentials not configured');
    }

    console.log('[tesla-register] Registering account for Europe region:', teslaApiBase);
    console.log('[tesla-register] Client ID:', clientId.substring(0, 10) + '...');

    // Get client credentials token for registration
    const tokenUrl = 'https://auth.tesla.com/oauth2/v3/token';
    
    console.log('[tesla-register] Step 1: Requesting client credentials token...');
    
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
      console.error('[tesla-register] Token error:', tokenError);
      throw new Error(`Failed to get access token: ${tokenError}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[tesla-register] Step 2: Got access token, calling register API...');

    const registerUrl = `${teslaApiBase}/api/1/partner_accounts`;
    console.log('[tesla-register] Register URL:', registerUrl);
    
    const registerResponse = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.access_token}`
      },
      body: JSON.stringify({
        domain: 'kmtrack.nl'
      })
    });

    const responseText = await registerResponse.text();
    console.log('[tesla-register] Response status:', registerResponse.status);
    console.log('[tesla-register] Response body:', responseText);

    let registerData;
    try {
      registerData = JSON.parse(responseText);
    } catch (e) {
      registerData = { raw: responseText };
    }

    if (!registerResponse.ok) {
      console.error('[tesla-register] Registration failed with status:', registerResponse.status);
      
      // Check if already registered
      if (responseText.includes('already registered') || 
          responseText.includes('Account already exists') ||
          registerResponse.status === 409) {
        console.log('[tesla-register] Account already registered, continuing...');
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Account is already registered for Europe region',
            alreadyRegistered: true,
            status: registerResponse.status
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Registration failed (${registerResponse.status}): ${responseText}`);
    }

    console.log('[tesla-register] SUCCESS: Account registered for Europe region');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Tesla account successfully registered for Europe region',
        data: registerData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[tesla-register] Error:', error.message);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
