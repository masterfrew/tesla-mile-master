import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WAKE_TIMEOUT_MS = 60000; // 60 seconds max for wake-up
const WAKE_POLL_INTERVAL_MS = 3000; // Check every 3 seconds

// Date helpers (work in UTC date strings: YYYY-MM-DD)
const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const parseDateStr = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s: string, days: number) => {
  const d = parseDateStr(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Reverse geocoding using OpenStreetMap Nominatim (free, no API key needed)
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'kmtrack.nl/1.0 (contact@kmtrack.nl)',
        'Accept-Language': 'nl'
      }
    });
    
    if (!response.ok) {
      console.log(`[tesla-mileage] Nominatim returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Build a readable address from components
    const addr = data.address || {};
    const parts = [];
    
    // Street + house number
    if (addr.road) {
      parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
    }
    
    // City/town/village
    const city = addr.city || addr.town || addr.village || addr.municipality;
    if (city) parts.push(city);
    
    if (parts.length > 0) {
      return parts.join(', ');
    }
    
    // Fallback to display_name (full address)
    return data.display_name?.split(',').slice(0, 3).join(',') || null;
  } catch (error) {
    console.error('[tesla-mileage] Reverse geocoding failed:', error);
    return null;
  }
}

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

// Wake up vehicle and wait until online
async function wakeUpVehicle(
  teslaApiBaseUrl: string,
  vehicleId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[tesla-mileage] Waking up vehicle ${vehicleId}...`);
  
  const startTime = Date.now();
  
  // Send wake_up command
  try {
    const wakeResponse = await fetch(
      `${teslaApiBaseUrl}/api/1/vehicles/${vehicleId}/wake_up`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!wakeResponse.ok) {
      const errorText = await wakeResponse.text();
      console.error(`[tesla-mileage] Wake-up command failed:`, errorText);
      // Don't fail yet, try polling anyway
    } else {
      console.log('[tesla-mileage] Wake-up command sent successfully');
    }
  } catch (error) {
    console.error('[tesla-mileage] Wake-up request failed:', error);
  }

  // Poll until vehicle is online or timeout
  while (Date.now() - startTime < WAKE_TIMEOUT_MS) {
    try {
      const statusResponse = await fetch(
        `${teslaApiBaseUrl}/api/1/vehicles/${vehicleId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const state = statusData.response?.state;
        console.log(`[tesla-mileage] Vehicle state: ${state}`);
        
        if (state === 'online') {
          console.log(`[tesla-mileage] Vehicle ${vehicleId} is now online`);
          return { success: true };
        }
      }
    } catch (error) {
      console.error('[tesla-mileage] Status check failed:', error);
    }

    console.log(`[tesla-mileage] Vehicle not online yet, waiting ${WAKE_POLL_INTERVAL_MS}ms...`);
    await sleep(WAKE_POLL_INTERVAL_MS);
  }

  console.error(`[tesla-mileage] Vehicle ${vehicleId} did not wake up within ${WAKE_TIMEOUT_MS}ms`);
  return { success: false, error: 'Vehicle did not wake up in time' };
}

// Backfill missing days with synthetic entries
async function backfillMissingDays(
  supabase: any,
  vehicleId: string,
  userId: string,
  lastReading: { odometer_km: number; reading_date: string; metadata?: any } | null,
  today: string,
  now: Date
): Promise<void> {
  if (!lastReading?.reading_date) return;
  
  let cursor = addDays(lastReading.reading_date, 1);
  while (cursor < today) {
    console.log(`[tesla-mileage] Backfilling ${cursor} with 0 km (synthetic)`);
    
    const { error: backfillError } = await supabase
      .from('mileage_readings')
      .upsert(
        {
          vehicle_id: vehicleId,
          user_id: userId,
          reading_date: cursor,
          odometer_km: lastReading.odometer_km,
          daily_km: 0,
          location_name: null,
          metadata: {
            synthetic: true,
            synthetic_reason: 'gap_fill',
            synced_at: now.toISOString(),
            start_odometer_km: lastReading.odometer_km,
            end_odometer_km: lastReading.odometer_km,
          },
        },
        { onConflict: 'vehicle_id,reading_date' }
      );

    if (backfillError) {
      console.error('[tesla-mileage] Backfill failed for', cursor, backfillError);
      break;
    }

    cursor = addDays(cursor, 1);
  }
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
    const errors: string[] = [];
    const now = new Date();
    const today = toDateStr(now);

    // Fetch and store mileage for each vehicle
    for (const vehicle of vehicles) {
      const vehicleName = vehicle.display_name || vehicle.vin;
      
      try {
        console.log(`[tesla-mileage] Processing vehicle ${vehicle.tesla_vehicle_id} (${vehicleName})`);

        // Get the most recent reading FIRST (for backfill, even if API fails)
        const { data: lastReading } = await supabase
          .from('mileage_readings')
          .select('odometer_km, reading_date, metadata')
          .eq('vehicle_id', vehicle.id)
          .order('reading_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        // ALWAYS backfill missing days (even before trying API)
        await backfillMissingDays(supabase, vehicle.id, user.id, lastReading, today, now);

        // Wake up vehicle first
        const wakeResult = await wakeUpVehicle(teslaApiBaseUrl, vehicle.tesla_vehicle_id, accessToken);
        
        if (!wakeResult.success) {
          console.warn(`[tesla-mileage] Vehicle ${vehicleName} could not be woken up: ${wakeResult.error}`);
          errors.push(`${vehicleName}: Voertuig kon niet gewekt worden (offline/slaapt)`);
          continue;
        }

        // Now fetch vehicle data
        console.log(`[tesla-mileage] Fetching data for vehicle ${vehicle.tesla_vehicle_id} (${vehicleName})`);
        
        const vehicleDataResponse = await fetch(
          `${teslaApiBaseUrl}/api/1/vehicles/${vehicle.tesla_vehicle_id}/vehicle_data?location_data=true`,
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
          errors.push(`${vehicleName}: API fout (${vehicleDataResponse.status})`);
          continue;
        }

        const vehicleData = await vehicleDataResponse.json();
        const odometerMiles = vehicleData.response?.vehicle_state?.odometer;

        if (!odometerMiles) {
          console.log(`[tesla-mileage] No odometer data for vehicle ${vehicle.tesla_vehicle_id}`);
          errors.push(`${vehicleName}: geen kilometerstand data`);
          continue;
        }

        // Convert miles to kilometers
        const odometerKm = Math.round(odometerMiles * 1.60934);

        // Get location data from Tesla API
        const driveState = vehicleData.response?.drive_state;
        
        // DEBUG: Log full drive_state to understand what Tesla returns
        console.log(`[tesla-mileage] DEBUG drive_state for ${vehicleName}:`, JSON.stringify(driveState, null, 2));
        console.log(`[tesla-mileage] DEBUG vehicle_state:`, JSON.stringify(vehicleData.response?.vehicle_state, null, 2));
        
        const latitude = driveState?.latitude || driveState?.active_route_latitude || null;
        const longitude = driveState?.longitude || driveState?.active_route_longitude || null;
        
        console.log(`[tesla-mileage] Location data: lat=${latitude}, lon=${longitude}, native_location_supported=${driveState?.native_location_supported}`);
        
        // Reverse geocode coordinates to get a readable address
        let locationName: string | null = null;
        if (latitude && longitude) {
          console.log(`[tesla-mileage] Reverse geocoding coordinates: ${latitude}, ${longitude}`);
          locationName = await reverseGeocode(latitude, longitude);
          console.log(`[tesla-mileage] Geocoded location: ${locationName}`);
        } else {
          console.log(`[tesla-mileage] WARNING: No location coordinates available from Tesla API`);
        }

        console.log(`[tesla-mileage] Vehicle ${vehicle.tesla_vehicle_id}: ${odometerKm} km, location: ${locationName || 'unknown'} (${latitude}, ${longitude})`);

        // Determine yesterday (the day we attribute distance to)
        const yesterday = addDays(today, -1);

        // Re-fetch yesterday's snapshot (after backfill). If missing, fall back to lastReading.
        const { data: prevSnapshot } = await supabase
          .from('mileage_readings')
          .select('odometer_km, reading_date, metadata')
          .eq('vehicle_id', vehicle.id)
          .eq('reading_date', yesterday)
          .maybeSingle();

        const baseSnapshot = prevSnapshot || lastReading;
        const baseOdometer = baseSnapshot?.odometer_km || 0;
        const dailyKm = baseOdometer > 0 ? Math.max(0, odometerKm - baseOdometer) : 0;

        // Update yesterday (or last known snapshot) with start/end + km if there was driving.
        if (dailyKm > 0 && baseSnapshot?.reading_date) {
          console.log(
            `[tesla-mileage] Updating day (${baseSnapshot.reading_date}) with ${dailyKm} km driven (start ${baseOdometer} → end ${odometerKm})`
          );

          const startLocationForDay = (baseSnapshot.metadata?.start_location ?? baseSnapshot.metadata?.location_name ?? null) as string | null;
          const mergedMetadata = {
            ...(baseSnapshot.metadata || {}),
            synthetic: false,
            updated_at: now.toISOString(),
            start_odometer_km: baseOdometer,
            end_odometer_km: odometerKm,
            latitude,
            longitude,
            location_name: locationName,
            start_location: startLocationForDay,
            end_location: locationName,
          };

          const { error: updateError } = await supabase
            .from('mileage_readings')
            .update({
              daily_km: dailyKm,
              odometer_km: odometerKm, // END of the period
              metadata: mergedMetadata,
              location_name: locationName,
            })
            .eq('vehicle_id', vehicle.id)
            .eq('reading_date', baseSnapshot.reading_date);

          if (updateError) {
            console.error('[tesla-mileage] Failed to update day bucket:', updateError);
          }
        }

        // UPSERT today's reading (snapshot of current odometer)
        const { data: todayExisting } = await supabase
          .from('mileage_readings')
          .select('metadata')
          .eq('vehicle_id', vehicle.id)
          .eq('reading_date', today)
          .maybeSingle();

        const preservedStartLocation = (todayExisting?.metadata?.start_location ?? locationName) as string | null;

        const { error: upsertError } = await supabase
          .from('mileage_readings')
          .upsert(
            {
              vehicle_id: vehicle.id,
              user_id: user.id,
              reading_date: today,
              odometer_km: odometerKm,
              daily_km: 0, // Will be updated tomorrow when we know how much was driven
              location_name: locationName,
              metadata: {
                ...(todayExisting?.metadata || {}),
                synced_at: now.toISOString(),
                latitude,
                longitude,
                location_name: locationName,
                start_location: preservedStartLocation,
                end_location: locationName,
                start_odometer_km: odometerKm,
                end_odometer_km: odometerKm, // Same for now, will be updated next sync
              },
            },
            {
              onConflict: 'vehicle_id,reading_date',
            }
          );

        if (upsertError) {
          console.error(`[tesla-mileage] Failed to upsert mileage for vehicle ${vehicle.tesla_vehicle_id}:`, upsertError);
          errors.push(`${vehicleName}: database fout`);
        } else {
          console.log(`[tesla-mileage] SUCCESS: Stored mileage for vehicle ${vehicle.tesla_vehicle_id}: ${odometerKm} km`);
          synced++;
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-mileage] Error processing vehicle ${vehicle.tesla_vehicle_id}:`, errorMsg);
        errors.push(`${vehicleName}: ${errorMsg}`);
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
