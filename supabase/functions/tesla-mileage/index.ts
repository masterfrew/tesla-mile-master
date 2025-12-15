import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get and migrate tokens
async function getTokensWithFallback(
  supabase: any,
  userId: string
): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null; migrated: boolean }> {
  
  // First, try to get encrypted tokens
  const { data: encryptedTokenData, error: encryptedError } = await supabase
    .from('encrypted_tesla_tokens')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (encryptedTokenData?.encrypted_access_token) {
    console.log('[tesla-mileage] Found encrypted tokens');
    try {
      const accessToken = await decryptToken(encryptedTokenData.encrypted_access_token);
      const refreshToken = encryptedTokenData.encrypted_refresh_token 
        ? await decryptToken(encryptedTokenData.encrypted_refresh_token)
        : null;
      const expiresAt = encryptedTokenData.token_expires_at 
        ? new Date(encryptedTokenData.token_expires_at) 
        : null;
      return { accessToken, refreshToken, expiresAt, migrated: false };
    } catch (error) {
      console.error('[tesla-mileage] Failed to decrypt tokens:', error);
    }
  }

  // Fallback: check profiles table for plaintext tokens
  console.log('[tesla-mileage] No encrypted tokens found, checking profiles table for migration...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError || !profile?.tesla_access_token) {
    console.log('[tesla-mileage] No tokens found in profiles table either');
    return { accessToken: null, refreshToken: null, expiresAt: null, migrated: false };
  }

  console.log('[tesla-mileage] Found plaintext tokens in profiles, migrating to encrypted storage...');
  
  // Encrypt and migrate tokens
  try {
    const encryptedAccessToken = await encryptToken(profile.tesla_access_token);
    const encryptedRefreshToken = profile.tesla_refresh_token 
      ? await encryptToken(profile.tesla_refresh_token)
      : null;
    
    // Store encrypted tokens
    await supabase.rpc('store_encrypted_tesla_tokens', {
      p_user_id: userId,
      p_encrypted_access_token: encryptedAccessToken,
      p_encrypted_refresh_token: encryptedRefreshToken,
      p_expires_at: profile.tesla_token_expires_at
    });

    console.log('[tesla-mileage] Token migration successful');
    
    return { 
      accessToken: profile.tesla_access_token, 
      refreshToken: profile.tesla_refresh_token,
      expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null,
      migrated: true 
    };
  } catch (error) {
    console.error('[tesla-mileage] Token migration failed:', error);
    // Still return the plaintext tokens so the sync can proceed
    return { 
      accessToken: profile.tesla_access_token, 
      refreshToken: profile.tesla_refresh_token,
      expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null,
      migrated: false 
    };
  }
}

// Helper function to refresh tokens
async function refreshAccessToken(
  supabase: any,
  userId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string | null; error?: string }> {
  console.log('[tesla-mileage] Refreshing expired token...');
  
  const refreshResponse = await fetch('https://auth.tesla.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error('[tesla-mileage] Token refresh failed:', errorText);
    return { accessToken: null, error: 'Token refresh failed' };
  }

  const tokens = await refreshResponse.json();
  
  // Encrypt and store refreshed tokens
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  const encryptedAccessToken = await encryptToken(tokens.access_token);
  const encryptedRefreshToken = await encryptToken(tokens.refresh_token);
  
  await supabase.rpc('store_encrypted_tesla_tokens', {
    p_user_id: userId,
    p_encrypted_access_token: encryptedAccessToken,
    p_encrypted_refresh_token: encryptedRefreshToken,
    p_expires_at: newExpiresAt
  });

  console.log('[tesla-mileage] Token refreshed and stored successfully');
  return { accessToken: tokens.access_token };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-mileage] Fetching Tesla mileage data...');

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
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-mileage] Failed to get user:', userError);
      return new Response(
        JSON.stringify({ 
          error: 'not_authenticated',
          message: 'Gebruiker niet geauthenticeerd'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-mileage] Getting tokens for user:', user.id);

    // Get tokens with fallback migration
    let { accessToken, refreshToken, expiresAt, migrated } = await getTokensWithFallback(supabase, user.id);

    if (!accessToken) {
      console.error('[tesla-mileage] No Tesla tokens found');
      return new Response(
        JSON.stringify({ 
          error: 'no_token',
          message: 'Geen Tesla toegangstoken gevonden. Verbind je Tesla account opnieuw.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (migrated) {
      console.log('[tesla-mileage] Tokens were migrated from plaintext to encrypted storage');
    }

    // Check if token is expired and refresh if needed
    if (expiresAt && expiresAt < new Date()) {
      if (!refreshToken) {
        return new Response(
          JSON.stringify({ 
            error: 'token_expired',
            message: 'Token verlopen en geen refresh token beschikbaar. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ 
            error: 'configuration_error',
            message: 'Tesla credentials niet geconfigureerd'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refreshResult = await refreshAccessToken(supabase, user.id, refreshToken, clientId, clientSecret);
      if (!refreshResult.accessToken) {
        return new Response(
          JSON.stringify({ 
            error: 'refresh_failed',
            message: 'Token vernieuwen mislukt. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      accessToken = refreshResult.accessToken;
    }

    // Get user's vehicles
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, tesla_vehicle_id, display_name, vin')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (vehiclesError) {
      console.error('[tesla-mileage] Failed to get vehicles:', vehiclesError);
      return new Response(
        JSON.stringify({ 
          error: 'no_vehicles',
          message: 'Kon voertuigen niet ophalen uit database'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!vehicles || vehicles.length === 0) {
      console.log('[tesla-mileage] No vehicles found for user');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Geen voertuigen om te synchroniseren',
          synced_vehicles: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[tesla-mileage] Syncing mileage for ${vehicles.length} vehicles`);
    
    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL')
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
    
    let synced = 0;
    const errors = [];

    // Fetch and store mileage for each vehicle
    for (const vehicle of vehicles) {
      try {
        console.log(`[tesla-mileage] Fetching data for vehicle ${vehicle.tesla_vehicle_id} (${vehicle.display_name || vehicle.vin})`);
        
        const vehicleDataResponse = await fetch(
          `${teslaApiBaseUrl}/api/1/vehicles/${vehicle.tesla_vehicle_id}/vehicle_data`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!vehicleDataResponse.ok) {
          const errorText = await vehicleDataResponse.text();
          console.error(`[tesla-mileage] Failed to fetch data for vehicle ${vehicle.tesla_vehicle_id}:`, errorText);
          errors.push(`${vehicle.display_name || vehicle.vin}: API fout (${vehicleDataResponse.status})`);
          continue;
        }

        const vehicleData = await vehicleDataResponse.json();
        const odometerMiles = vehicleData.response?.vehicle_state?.odometer;

        if (!odometerMiles) {
          console.log(`[tesla-mileage] No odometer data for vehicle ${vehicle.tesla_vehicle_id}`);
          errors.push(`${vehicle.display_name || vehicle.vin}: geen kilometerstand data`);
          continue;
        }

        // Convert miles to kilometers
        const odometerKm = Math.round(odometerMiles * 1.60934);
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Get location data from Tesla API if available
        const driveState = vehicleData.response?.drive_state;
        const locationName = driveState?.active_route_destination || null;
        const latitude = driveState?.latitude || null;
        const longitude = driveState?.longitude || null;

        console.log(`[tesla-mileage] Vehicle ${vehicle.tesla_vehicle_id}: ${odometerKm} km, location: ${latitude}, ${longitude}`);

        // Get the most recent reading to calculate daily km
        const { data: prevReading } = await supabase
          .from('mileage_readings')
          .select('odometer_km, reading_date')
          .eq('vehicle_id', vehicle.id)
          .order('reading_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const dailyKm = prevReading 
          ? Math.max(0, odometerKm - prevReading.odometer_km)
          : 0;

        // If there's km driven and we have a previous reading, 
        // update the PREVIOUS day's record with the daily_km
        if (dailyKm > 0 && prevReading) {
          console.log(`[tesla-mileage] Updating previous day (${prevReading.reading_date}) with ${dailyKm} km driven`);
          
          const { error: updateError } = await supabase
            .from('mileage_readings')
            .update({ 
              daily_km: dailyKm,
              metadata: {
                updated_at: now.toISOString(),
                end_odometer_km: odometerKm,
                latitude,
                longitude,
                location_name: locationName,
              }
            })
            .eq('vehicle_id', vehicle.id)
            .eq('reading_date', prevReading.reading_date);

          if (updateError) {
            console.error(`[tesla-mileage] Failed to update previous reading:`, updateError);
          }
        }

        // UPSERT today's reading (snapshot of current odometer)
        const { error: upsertError } = await supabase
          .from('mileage_readings')
          .upsert({
            vehicle_id: vehicle.id,
            user_id: user.id,
            reading_date: today,
            odometer_km: odometerKm,
            daily_km: 0,
            location_name: locationName,
            metadata: {
              synced_at: now.toISOString(),
              latitude,
              longitude,
            }
          }, {
            onConflict: 'vehicle_id,reading_date',
          });

        if (upsertError) {
          console.error(`[tesla-mileage] Failed to upsert mileage for vehicle ${vehicle.tesla_vehicle_id}:`, upsertError);
          errors.push(`${vehicle.display_name || vehicle.vin}: database fout`);
        } else {
          console.log(`[tesla-mileage] SUCCESS: Stored mileage for vehicle ${vehicle.tesla_vehicle_id}: ${odometerKm} km`);
          synced++;
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-mileage] Error processing vehicle ${vehicle.tesla_vehicle_id}:`, errorMsg);
        errors.push(`${vehicle.display_name || vehicle.vin}: ${errorMsg}`);
        continue;
      }
    }

    console.log(`[tesla-mileage] Completed: ${synced}/${vehicles.length} vehicles synced`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${synced} van ${vehicles.length} voertuigen gesynchroniseerd`,
        synced_vehicles: synced,
        total_vehicles: vehicles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-mileage] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Er ging iets mis bij het synchroniseren',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
