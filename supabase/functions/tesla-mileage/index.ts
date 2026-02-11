import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';
import { appendToSheet } from '../_shared/sheets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Replace this with your actual spreadsheet ID or fetch from DB
const SPREADSHEET_ID = '1xU7-FSZ1keYUAhEpt-2RRXWzLwjzvUUbesS4SJRI_3o';
const SHEET_NAME = 'Ritten';

const WAKE_TIMEOUT_MS = 60000; // 60 seconds max for wake-up
const WAKE_POLL_INTERVAL_MS = 3000; // Check every 3 seconds

// Date helpers
const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const toTimeStr = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Reverse geocoding using OpenStreetMap Nominatim
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
    const addr = data.address || {};
    const parts = [];
    
    if (addr.road) parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
    const city = addr.city || addr.town || addr.village || addr.municipality;
    if (city) parts.push(city);
    
    return parts.length > 0 ? parts.join(', ') : (data.display_name?.split(',').slice(0, 3).join(',') || null);
  } catch (error) {
    console.error('[tesla-mileage] Reverse geocoding failed:', error);
    return null;
  }
}

// Helper function to get and migrate tokens
async function getTokensWithFallback(
  supabase: any,
  userId: string
): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null }> {
  
  const { data: encryptedTokenData } = await supabase
    .from('encrypted_tesla_tokens')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (encryptedTokenData?.encrypted_access_token) {
    try {
      const accessToken = await decryptToken(encryptedTokenData.encrypted_access_token);
      const refreshToken = encryptedTokenData.encrypted_refresh_token 
        ? await decryptToken(encryptedTokenData.encrypted_refresh_token)
        : null;
      const expiresAt = encryptedTokenData.token_expires_at 
        ? new Date(encryptedTokenData.token_expires_at) 
        : null;
      return { accessToken, refreshToken, expiresAt };
    } catch (error) {
      console.error('[tesla-mileage] Failed to decrypt tokens:', error);
    }
  }

  // Fallback: check profiles table for plaintext tokens
  const { data: profile } = await supabase
    .from('profiles')
    .select('tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile?.tesla_access_token) {
    return { accessToken: null, refreshToken: null, expiresAt: null };
  }
  
  return { 
    accessToken: profile.tesla_access_token, 
    refreshToken: profile.tesla_refresh_token,
    expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null
  };
}

// Helper function to refresh tokens
async function refreshAccessToken(
  supabase: any,
  userId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string | null }> {
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
    console.error('[tesla-mileage] Token refresh failed');
    return { accessToken: null };
  }

  const tokens = await refreshResponse.json();
  
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  const encryptedAccessToken = await encryptToken(tokens.access_token);
  const encryptedRefreshToken = await encryptToken(tokens.refresh_token);
  
  await supabase.rpc('store_encrypted_tesla_tokens', {
    p_user_id: userId,
    p_encrypted_access_token: encryptedAccessToken,
    p_encrypted_refresh_token: encryptedRefreshToken,
    p_expires_at: newExpiresAt
  });

  return { accessToken: tokens.access_token };
}

// Wake up vehicle
async function wakeUpVehicle(
  teslaApiBaseUrl: string,
  vehicleId: string,
  accessToken: string
): Promise<{ success: boolean }> {
  console.log(`[tesla-mileage] Waking up vehicle ${vehicleId}...`);
  const startTime = Date.now();
  
  try {
    await fetch(`${teslaApiBaseUrl}/api/1/vehicles/${vehicleId}/wake_up`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[tesla-mileage] Wake-up request failed:', error);
  }

  while (Date.now() - startTime < WAKE_TIMEOUT_MS) {
    try {
      const statusResponse = await fetch(`${teslaApiBaseUrl}/api/1/vehicles/${vehicleId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.response?.state === 'online') return { success: true };
      }
    } catch (error) {
      console.error('[tesla-mileage] Status check failed:', error);
    }
    await sleep(WAKE_POLL_INTERVAL_MS);
  }

  return { success: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    console.log('[tesla-mileage] Syncing mileage to Google Sheets...');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: 'not_authenticated' }), { status: 401, headers: corsHeaders });

    let { accessToken, refreshToken, expiresAt } = await getTokensWithFallback(supabase, user.id);

    if (!accessToken) return new Response(JSON.stringify({ error: 'no_token' }), { status: 400, headers: corsHeaders });

    if (expiresAt && expiresAt < new Date()) {
      if (!refreshToken || !clientId || !clientSecret) return new Response(JSON.stringify({ error: 'token_expired' }), { status: 401, headers: corsHeaders });
      const refreshResult = await refreshAccessToken(supabase, user.id, refreshToken, clientId, clientSecret);
      if (!refreshResult.accessToken) return new Response(JSON.stringify({ error: 'refresh_failed' }), { status: 401, headers: corsHeaders });
      accessToken = refreshResult.accessToken;
    }

    const { data: vehicles } = await supabase.from('vehicles').select('*').eq('user_id', user.id).eq('is_active', true);
    if (!vehicles || vehicles.length === 0) return new Response(JSON.stringify({ message: 'No vehicles' }), { headers: corsHeaders });

    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL') || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
    let synced = 0;
    const now = new Date();

    for (const vehicle of vehicles) {
      try {
        await wakeUpVehicle(teslaApiBaseUrl, vehicle.tesla_vehicle_id, accessToken);

        const vehicleDataResponse = await fetch(
          `${teslaApiBaseUrl}/api/1/vehicles/${vehicle.tesla_vehicle_id}/vehicle_data?location_data=true`,
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        if (!vehicleDataResponse.ok) continue;

        const vehicleData = await vehicleDataResponse.json();
        const odometerMiles = vehicleData.response?.vehicle_state?.odometer;
        if (!odometerMiles) continue;

        const odometerKm = Math.round(odometerMiles * 1.60934);
        const driveState = vehicleData.response?.drive_state;
        
        let locationName = 'Onbekend';
        if (driveState?.latitude && driveState?.longitude) {
          const loc = await reverseGeocode(driveState.latitude, driveState.longitude);
          if (loc) locationName = loc;
        }

        // Check last stored mileage in DB to calculate difference
        const { data: lastReading } = await supabase
          .from('mileage_readings')
          .select('odometer_km, created_at')
          .eq('vehicle_id', vehicle.id)
          .order('reading_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const previousOdo = lastReading?.odometer_km || odometerKm;
        const diffKm = odometerKm - previousOdo;

        // ONLY log if there is a difference or it's the first time
        if (diffKm > 0 || !lastReading) {
          console.log(`[tesla-mileage] New trip detected: ${diffKm} km`);

          // 1. Store in Supabase (for app state)
          await supabase.from('mileage_readings').upsert({
            vehicle_id: vehicle.id,
            user_id: user.id,
            reading_date: toDateStr(now),
            odometer_km: odometerKm,
            daily_km: diffKm,
            location_name: locationName,
            metadata: { latitude: driveState?.latitude, longitude: driveState?.longitude }
          }, { onConflict: 'vehicle_id,reading_date' });

          // 2. Append to Google Sheet (The Logbook)
          // Format: [Datum, Tijd, Kenteken, Start KM, Eind KM, Verschil, Locatie, Type]
          const sheetRow = [
            toDateStr(now),
            toTimeStr(now),
            vehicle.license_plate || vehicle.vin,
            previousOdo,
            odometerKm,
            diffKm,
            locationName,
            "Zakelijk" // Default
          ];

          try {
            await appendToSheet(SPREADSHEET_ID, `${SHEET_NAME}!A:H`, sheetRow);
            console.log('[tesla-mileage] Logged to Google Sheet');
          } catch (sheetError) {
            console.error('[tesla-mileage] Failed to log to sheet:', sheetError);
          }
          
          synced++;
        } else {
          console.log('[tesla-mileage] No movement detected, skipping log');
        }

      } catch (error) {
        console.error(`[tesla-mileage] Error processing vehicle ${vehicle.tesla_vehicle_id}:`, error);
      }
    }

    return new Response(JSON.stringify({ success: true, synced }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'server_error', details: error instanceof Error ? error.message : 'Unknown' }), { status: 500, headers: corsHeaders });
  }
});
