import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-register] Starting Tesla account registration for Europe region');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
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
      throw new Error('Unauthorized');
    }

    console.log('[tesla-register] User authenticated:', user.id);

    // Get Tesla credentials
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const teslaApiBase = Deno.env.get('TESLA_FLEET_API_BASE_URL') || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    if (!clientId || !clientSecret) {
      throw new Error('Tesla credentials not configured');
    }

    console.log('[tesla-register] Registering account for Europe region:', teslaApiBase);

    // Register the partner account for the Europe region
    const registerUrl = `${teslaApiBase}/api/1/partner_accounts`;
    
    // First get an access token for the registration
    const tokenUrl = 'https://auth.tesla.com/oauth2/v3/token';
    
    console.log('[tesla-register] Requesting client credentials token...');
    
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
    const accessToken = tokenData.access_token;

    console.log('[tesla-register] Got access token, calling register API...');
    console.log('[tesla-register] Register URL:', registerUrl);
    
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

    // IMPORTANT: Read response first before checking status
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
      console.error('[tesla-register] Registration failed:', registerData);
      
      // Check if already registered
      if (responseText.includes('already registered') || responseText.includes('Account already exists')) {
        console.log('[tesla-register] Account already registered, continuing...');
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Account is already registered for Europe region',
            alreadyRegistered: true
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
