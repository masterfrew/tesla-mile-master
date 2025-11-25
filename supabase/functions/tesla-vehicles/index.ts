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
    console.log('[tesla-vehicles] Fetching Tesla vehicles...');

    // Get user from auth header
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-vehicles] Failed to get user:', userError);
      return new Response(
        JSON.stringify({ 
          error: 'not_authenticated',
          message: 'Gebruiker niet geauthenticeerd'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-vehicles] Getting tokens for user:', user.id);

    // Get tokens and check expiry
    const { data: profile, error: tokenError } = await supabase
      .from('profiles')
      .select('tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !profile) {
      console.error('[tesla-vehicles] Failed to get profile:', tokenError);
      return new Response(
        JSON.stringify({ 
          error: 'no_profile',
          message: 'Geen profiel gevonden'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile.tesla_access_token) {
      console.error('[tesla-vehicles] No Tesla access token found');
      return new Response(
        JSON.stringify({ 
          error: 'no_token',
          message: 'Geen Tesla toegangstoken gevonden. Verbind je Tesla account opnieuw.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired
    let accessToken = profile.tesla_access_token;
    const expiresAt = profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null;
    
    if (expiresAt && expiresAt < new Date()) {
      console.log('[tesla-vehicles] Token expired, attempting refresh...');
      
      if (!profile.tesla_refresh_token) {
        console.error('[tesla-vehicles] No refresh token available');
        return new Response(
          JSON.stringify({ 
            error: 'token_expired',
            message: 'Token verlopen en geen refresh token beschikbaar. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Refresh the token
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

      const refreshResponse = await fetch('https://auth.tesla.com/oauth2/v3/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: profile.tesla_refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        console.error('[tesla-vehicles] Token refresh failed:', errorText);
        return new Response(
          JSON.stringify({ 
            error: 'refresh_failed',
            message: 'Token vernieuwen mislukt. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      // Store refreshed tokens
      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
      await supabase.rpc('store_tesla_tokens', {
        p_user_id: user.id,
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_expires_at: newExpiresAt
      });

      console.log('[tesla-vehicles] Token refreshed successfully');
    }

    console.log('[tesla-vehicles] Fetching vehicles from Tesla API...');

    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL')
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    // Fetch vehicles from Tesla API
    const vehiclesResponse = await fetch(`${teslaApiBaseUrl}/api/1/vehicles`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vehiclesResponse.ok) {
      const errorText = await vehiclesResponse.text();
      console.error('[tesla-vehicles] Tesla API error:', vehiclesResponse.status, errorText);
      console.error('[tesla-vehicles] Tesla API base URL used:', teslaApiBaseUrl);
      
      return new Response(
        JSON.stringify({ 
          error: 'api_error',
          message: `Tesla API fout (${vehiclesResponse.status})`,
          details: errorText,
          apiUrl: teslaApiBaseUrl
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vehiclesData = await vehiclesResponse.json();
    const vehicles = vehiclesData.response || [];
    
    console.log(`[tesla-vehicles] Found ${vehicles.length} vehicles`);

    if (vehicles.length === 0) {
      console.log('[tesla-vehicles] No vehicles found for this account');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Geen voertuigen gevonden',
          vehicles_count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and store vehicles in database
    let storedCount = 0;
    const errors = [];

    for (const vehicle of vehicles) {
      try {
        // Validate required fields
        if (!vehicle.id || !vehicle.vin) {
          console.error('[tesla-vehicles] Invalid vehicle data - missing id or vin:', vehicle);
          errors.push(`Vehicle ${vehicle.display_name || 'unknown'}: missing required data`);
          continue;
        }

        const { error: upsertError } = await supabase
          .from('vehicles')
          .upsert({
            user_id: user.id,
            tesla_vehicle_id: vehicle.id,
            vin: vehicle.vin,
            display_name: vehicle.display_name || null,
            model: vehicle.vehicle_config?.car_type || null,
            color: vehicle.vehicle_config?.exterior_color || null,
            year: vehicle.vehicle_config?.year || null,
            is_active: true,
          }, {
            onConflict: 'user_id,tesla_vehicle_id',
          });

        if (upsertError) {
          console.error('[tesla-vehicles] Failed to upsert vehicle:', vehicle.vin, upsertError);
          errors.push(`${vehicle.vin}: ${upsertError.message}`);
        } else {
          console.log('[tesla-vehicles] Stored vehicle:', vehicle.vin);
          storedCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[tesla-vehicles] Error processing vehicle:', errorMsg);
        errors.push(`Processing error: ${errorMsg}`);
      }
    }

    console.log(`[tesla-vehicles] SUCCESS: Stored ${storedCount}/${vehicles.length} vehicles`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${storedCount} voertuigen opgeslagen`,
        vehicles_count: storedCount,
        total_found: vehicles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-vehicles] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Er ging iets mis bij het ophalen van voertuigen',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});