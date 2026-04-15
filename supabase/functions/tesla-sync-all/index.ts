import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { appendToSheet } from '../_shared/sheets.ts';
import { reverseGeocode } from '../_shared/geocoding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const WAKE_TIMEOUT_MS = 60000; // 60 seconds max for wake-up
const WAKE_POLL_INTERVAL_MS = 3000; // Check every 3 seconds

// Replace this with your actual spreadsheet ID or fetch from DB (hardcoded for now)
const SPREADSHEET_ID = '1xU7-FSZ1keYUAhEpt-2RRXWzLwjzvUUbesS4SJRI_3o';
const SHEET_NAME = 'Ritten';

// Date helpers (work in UTC date strings: YYYY-MM-DD)
const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const toTimeStr = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const parseDateStr = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s: string, days: number) => {
  const d = parseDateStr(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isVehicleOfflineError(status: number, errorText: string): boolean {
  const offlineIndicators = [
    'vehicle unavailable', 'vehicle is offline', 'timeout', 'asleep', 'could not wake', '408', '504'
  ];
  if (status === 408 || status === 504) return true;
  const lowerError = errorText.toLowerCase();
  return offlineIndicators.some(indicator => lowerError.includes(indicator.toLowerCase()));
}

// Wake up vehicle and wait until online
async function wakeUpVehicle(
  teslaApiBaseUrl: string,
  vehicleId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[tesla-sync-all] Waking up vehicle ${vehicleId}...`);
  
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
      console.error(`[tesla-sync-all] Wake-up command failed:`, errorText);
    } else {
      console.log('[tesla-sync-all] Wake-up command sent successfully');
    }
  } catch (error) {
    console.error('[tesla-sync-all] Wake-up request failed:', error);
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
        console.log(`[tesla-sync-all] Vehicle state: ${state}`);
        
        if (state === 'online') {
          console.log(`[tesla-sync-all] Vehicle ${vehicleId} is now online`);
          return { success: true };
        }
      }
    } catch (error) {
      console.error('[tesla-sync-all] Status check failed:', error);
    }

    console.log(`[tesla-sync-all] Vehicle not online yet, waiting ${WAKE_POLL_INTERVAL_MS}ms...`);
    await sleep(WAKE_POLL_INTERVAL_MS);
  }

  console.error(`[tesla-sync-all] Vehicle ${vehicleId} did not wake up within ${WAKE_TIMEOUT_MS}ms`);
  return { success: false, error: 'Vehicle did not wake up in time' };
}

async function fetchVehicleDataWithRetry(
  teslaApiBaseUrl: string,
  vehicleId: string,
  accessToken: string,
  retries: number = MAX_RETRIES
): Promise<{ success: boolean; data?: any; isOffline: boolean; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[tesla-sync-all] Attempt ${attempt}/${retries} for vehicle ${vehicleId}`);
      
      const response = await fetch(
        `${teslaApiBaseUrl}/api/1/vehicles/${vehicleId}/vehicle_data`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return { success: true, data, isOffline: false };
      }

      const errorText = await response.text();
      const isOffline = isVehicleOfflineError(response.status, errorText);
      
      if (isOffline && attempt < retries) {
        console.log(`[tesla-sync-all] Vehicle ${vehicleId} appears offline, retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      
      return { success: false, isOffline, error: `API error (${response.status}): ${errorText.substring(0, 100)}` };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isOffline = isVehicleOfflineError(0, errorMsg);
      
      if (attempt < retries) {
        console.log(`[tesla-sync-all] Request failed, retrying... Error: ${errorMsg}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      
      return { success: false, isOffline, error: errorMsg };
    }
  }
  
  return { success: false, isOffline: true, error: 'Max retries exceeded' };
}

async function updateSyncStatus(
  supabase: any,
  vehicleId: string,
  userId: string,
  success: boolean,
  isOffline: boolean,
  errorMsg?: string
) {
  const now = new Date().toISOString();
  
  const { data: existingStatus } = await supabase
    .from('vehicle_sync_status')
    .select('id, consecutive_failures')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  const consecutiveFailures = success ? 0 : (existingStatus?.consecutive_failures || 0) + 1;

  if (existingStatus) {
    await supabase
      .from('vehicle_sync_status')
      .update({
        last_sync_attempt: now,
        last_successful_sync: success ? now : undefined,
        consecutive_failures: consecutiveFailures,
        last_error: errorMsg || null,
        is_offline: isOffline,
      })
      .eq('id', existingStatus.id);
  } else {
    await supabase
      .from('vehicle_sync_status')
      .insert({
        vehicle_id: vehicleId,
        user_id: userId,
        last_sync_attempt: now,
        last_successful_sync: success ? now : null,
        consecutive_failures: consecutiveFailures,
        last_error: errorMsg || null,
        is_offline: isOffline,
      });
  }
}

async function logAuditEvent(
  supabase: any,
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, any>
) {
  try {
    await supabase.rpc('log_audit_event', {
      p_user_id: userId,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId || null,
      p_details: details || {}
    });
  } catch (error) {
    console.error('[tesla-sync-all] Failed to log audit event:', error);
  }
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
    console.log(`[tesla-sync-all] Backfilling ${cursor} with 0 km (synthetic)`);
    
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
      console.error('[tesla-sync-all] Backfill failed for', cursor, backfillError);
      break;
    }

    cursor = addDays(cursor, 1);
  }
}

/**
 * Create or update a daily trip record in the `trips` table.
 *
 * Logic:
 * - On first sync of the day: creates a new trip with current location as start.
 * - On subsequent syncs: updates end location, end odometer, and ended_at.
 * - If the car has moved (dailyKm > 0), the start location is preserved from the
 *   first sync of the day, and the end location is updated to the current position.
 */
async function upsertDailyTrip(
  supabase: any,
  params: {
    vehicleId: string;
    userId: string;
    date: string;        // YYYY-MM-DD
    startOdometer: number;
    endOdometer: number;
    dailyKm: number;
    latitude: number | null;
    longitude: number | null;
    locationName: string | null;
    geocodeResult: any | null;
    now: Date;
  }
): Promise<void> {
  const {
    vehicleId, userId, date, startOdometer, endOdometer,
    dailyKm, latitude, longitude, locationName, geocodeResult, now,
  } = params;

  try {
    // Check if there's already a trip for this vehicle + date
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id, start_lat, start_lon, start_location, start_odometer_km, started_at')
      .eq('vehicle_id', vehicleId)
      .eq('user_id', userId)
      .eq('is_manual', false)
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTrip) {
      // ── UPDATE existing trip: set end location to current position ──
      const updateData: Record<string, any> = {
        ended_at: now.toISOString(),
        end_odometer_km: endOdometer,
        updated_at: now.toISOString(),
      };

      // Only update end location if we have coordinates
      if (latitude && longitude) {
        updateData.end_lat = latitude;
        updateData.end_lon = longitude;
        updateData.end_location = locationName;
      }

      // Update metadata with latest geocoding info
      updateData.metadata = {
        last_sync: now.toISOString(),
        daily_km: dailyKm,
        geocode_end: geocodeResult ? {
          display_name: geocodeResult.displayName,
          city: geocodeResult.city,
          road: geocodeResult.road,
          postcode: geocodeResult.postcode,
        } : null,
      };

      const { error: updateError } = await supabase
        .from('trips')
        .update(updateData)
        .eq('id', existingTrip.id);

      if (updateError) {
        console.error('[tesla-sync-all] Failed to update trip:', updateError);
      } else {
        console.log(`[tesla-sync-all] Updated trip ${existingTrip.id} — end: ${locationName || 'unknown'}, ${endOdometer} km`);
      }

    } else if (dailyKm > 0) {
      // ── CREATE new trip for today ──
      // The start location is wherever the car was at the start of the day (previous sync position).
      // We need to look up the previous day's end location.
      const { data: prevTrip } = await supabase
        .from('trips')
        .select('end_lat, end_lon, end_location')
        .eq('vehicle_id', vehicleId)
        .eq('user_id', userId)
        .lt('started_at', dayStart)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const startLat = prevTrip?.end_lat || null;
      const startLon = prevTrip?.end_lon || null;
      let startLocation = prevTrip?.end_location || null;

      // If we have previous coordinates but no location name, try geocoding them
      if (startLat && startLon && !startLocation) {
        try {
          const startGeo = await reverseGeocode(startLat, startLon);
          if (startGeo) {
            startLocation = startGeo.shortName;
            console.log(`[tesla-sync-all] Geocoded start ${startLat},${startLon} → ${startLocation}`);
          }
        } catch (e) {
          console.error('[tesla-sync-all] Start geocoding failed:', e);
        }
        // Respect Nominatim rate limit (1 req/sec)
        await sleep(1100);
      }

      const tripData = {
        vehicle_id: vehicleId,
        user_id: userId,
        started_at: `${date}T00:00:00.000Z`,
        ended_at: now.toISOString(),
        start_odometer_km: startOdometer,
        end_odometer_km: endOdometer,
        start_lat: startLat,
        start_lon: startLon,
        start_location: startLocation,
        end_lat: latitude,
        end_lon: longitude,
        end_location: locationName,
        purpose: 'personal',  // Default, user can change in the UI
        is_manual: false,
        description: null,
        metadata: {
          created_by: 'tesla-sync-all',
          created_at: now.toISOString(),
          daily_km: dailyKm,
          geocode_start: startLocation ? { from_previous_trip: true } : null,
          geocode_end: geocodeResult ? {
            display_name: geocodeResult.displayName,
            city: geocodeResult.city,
            road: geocodeResult.road,
            postcode: geocodeResult.postcode,
          } : null,
        },
      };

      const { error: insertError } = await supabase
        .from('trips')
        .insert(tripData);

      if (insertError) {
        console.error('[tesla-sync-all] Failed to create trip:', insertError);
      } else {
        console.log(`[tesla-sync-all] Created trip: ${startLocation || '?'} → ${locationName || '?'} (${dailyKm} km)`);
      }
    }
    // If dailyKm === 0 and no existing trip, do nothing (car didn't move)

  } catch (error) {
    console.error('[tesla-sync-all] Trip upsert error:', error);
    // Don't fail the sync for a trip record issue
  }
}

async function syncUserVehicles(
  supabase: any,
  userId: string,
  accessToken: string,
  teslaApiBaseUrl: string
): Promise<{ synced: number; failed: number; offline: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let failed = 0;
  let offline = 0;

  const { data: vehicles, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('id, tesla_vehicle_id, display_name, vin')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (vehiclesError || !vehicles || vehicles.length === 0) {
    console.log(`[tesla-sync-all] No vehicles for user ${userId}`);
    return { synced: 0, failed: 0, offline: 0, errors: [] };
  }

  const now = new Date();
  const today = toDateStr(now);

  for (const vehicle of vehicles) {
    const vehicleName = vehicle.display_name || vehicle.vin;
    
    try {
      console.log(`[tesla-sync-all] Processing vehicle ${vehicle.tesla_vehicle_id} (${vehicleName})`);
      
      // Get the most recent reading FIRST (for backfill, even if API fails)
      const { data: lastReading } = await supabase
        .from('mileage_readings')
        .select('odometer_km, reading_date, metadata')
        .eq('vehicle_id', vehicle.id)
        .order('reading_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // ALWAYS backfill missing days (even before trying API)
      await backfillMissingDays(supabase, vehicle.id, userId, lastReading, today, now);

      // Wake up vehicle first
      const wakeResult = await wakeUpVehicle(teslaApiBaseUrl, vehicle.tesla_vehicle_id, accessToken);
      
      if (!wakeResult.success) {
        console.warn(`[tesla-sync-all] Vehicle ${vehicleName} could not be woken up`);
        offline++;
        errors.push(`${vehicleName}: Vehicle offline/asleep`);
        await updateSyncStatus(supabase, vehicle.id, userId, false, true, wakeResult.error);
        continue;
      }

      // Now fetch vehicle data with retries
      const result = await fetchVehicleDataWithRetry(
        teslaApiBaseUrl,
        vehicle.tesla_vehicle_id,
        accessToken
      );

      if (!result.success) {
        if (result.isOffline) {
          offline++;
          console.log(`[tesla-sync-all] Vehicle ${vehicleName} is offline`);
          errors.push(`${vehicleName}: Vehicle offline`);
        } else {
          failed++;
          errors.push(`${vehicleName}: ${result.error}`);
        }
        await updateSyncStatus(supabase, vehicle.id, userId, false, result.isOffline, result.error);
        continue;
      }

      const odometerMiles = result.data?.response?.vehicle_state?.odometer;

      if (!odometerMiles) {
        failed++;
        errors.push(`${vehicleName}: No odometer data available`);
        await updateSyncStatus(supabase, vehicle.id, userId, false, false, 'No odometer data');
        continue;
      }

      const odometerKm = Math.round(odometerMiles * 1.60934);
      const yesterday = addDays(today, -1);

      const driveState = result.data?.response?.drive_state || {};
      const chargeState = result.data?.response?.charge_state || {};
      const vehicleState = result.data?.response?.vehicle_state || {};

      const latitude = driveState.latitude || null;
      const longitude = driveState.longitude || null;
      const heading = driveState.heading || null;
      const speed = driveState.speed || null; // mph, null if parked
      const shiftState = driveState.shift_state || null; // D, R, P, N, or null
      const nativeLocationSupported = driveState.native_location_supported ?? null;
      const activeRouteDestination = driveState.active_route_destination || null;

      // Reverse geocode current position to get a readable address
      let locationName = activeRouteDestination;
      let geocodeResult = null;

      if (latitude && longitude) {
        try {
          geocodeResult = await reverseGeocode(latitude, longitude);
          if (geocodeResult) {
            // Use the short name (e.g. "Keizersgracht, Amsterdam") as location
            locationName = geocodeResult.shortName;
            console.log(`[tesla-sync-all] Geocoded ${latitude},${longitude} → ${locationName}`);
          }
        } catch (geoError) {
          console.error('[tesla-sync-all] Geocoding failed:', geoError);
          // Fall back to active_route_destination or coordinates
          if (!locationName && latitude && longitude) {
            locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          }
        }
        // Respect Nominatim rate limit (1 req/sec) before any subsequent geocode calls
        await sleep(1100);
      }

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

      // Update the attributed day (yesterday or last snapshot) with start/end + km if there was driving.
      if (dailyKm > 0 && baseSnapshot?.reading_date) {
        console.log(
          `[tesla-sync-all] Updating day (${baseSnapshot.reading_date}) with ${dailyKm} km driven (start ${baseOdometer} → end ${odometerKm})`
        );

        const mergedMetadata = {
          ...(baseSnapshot.metadata || {}),
          synthetic: false,
          updated_at: now.toISOString(),
          start_odometer_km: baseOdometer,
          end_odometer_km: odometerKm,
          latitude,
          longitude,
          heading,
          speed,
          shift_state: shiftState,
          location_name: locationName,
          geocode: geocodeResult ? {
            display_name: geocodeResult.displayName,
            short_name: geocodeResult.shortName,
            city: geocodeResult.city,
            road: geocodeResult.road,
            postcode: geocodeResult.postcode,
          } : null,
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
          console.error('[tesla-sync-all] Failed to update day bucket:', updateError);
        }
      }

      // UPSERT today's reading as a snapshot of current odometer
      const { error: upsertError } = await supabase
        .from('mileage_readings')
        .upsert(
          {
            vehicle_id: vehicle.id,
            user_id: userId,
            reading_date: today,
            odometer_km: odometerKm,
            daily_km: 0, // Will be updated tomorrow
            location_name: locationName,
            metadata: {
              synced_at: now.toISOString(),
              latitude,
              longitude,
              heading,
              speed,
              shift_state: shiftState,
              location_name: locationName,
              start_odometer_km: odometerKm,
              end_odometer_km: odometerKm,
              geocode: geocodeResult ? {
                display_name: geocodeResult.displayName,
                short_name: geocodeResult.shortName,
                city: geocodeResult.city,
                road: geocodeResult.road,
                postcode: geocodeResult.postcode,
              } : null,
            },
          },
          { onConflict: 'vehicle_id,reading_date' }
        );

      if (upsertError) {
        failed++;
        errors.push(`${vehicleName}: Database error`);
        await updateSyncStatus(supabase, vehicle.id, userId, false, false, 'Database error');
      } else {
        synced++;
        await updateSyncStatus(supabase, vehicle.id, userId, true, false);
        await logAuditEvent(supabase, userId, 'MILEAGE_SYNC', 'vehicle', vehicle.id, {
          odometer_km: odometerKm,
          daily_km: dailyKm,
          reading_date: baseSnapshot?.reading_date || today,
        });

        // ── Create or update trip record in the `trips` table ──
        // This gives the frontend rich start/end location data for each day's driving.
        await upsertDailyTrip(supabase, {
          vehicleId: vehicle.id,
          userId,
          date: baseSnapshot?.reading_date || today,
          startOdometer: baseOdometer,
          endOdometer: odometerKm,
          dailyKm,
          latitude,
          longitude,
          locationName,
          geocodeResult,
          now,
        });

        // 3. Append to Google Sheet if there was movement
        // Only if daily_km > 0. (For cron jobs, daily_km here represents km driven since the *previous* sync,
        // IF we assume the previous sync was earlier today or yesterday).
        // BUT: syncUserVehicles calculates daily_km against the *start of the day* or previous day snapshot.
        // Wait, let's re-read:
        // const baseSnapshot = prevSnapshot || lastReading;
        // const dailyKm = baseOdometer > 0 ? Math.max(0, odometerKm - baseOdometer) : 0;
        
        // This daily_km is the total km driven *since baseSnapshot*.
        // If baseSnapshot was yesterday, daily_km is total for today so far.
        // If we log this to sheet every hour, we log the cumulative total repeatedly.
        // We only want to log the *difference* since the last log.
        // Or we just append a row with the current timestamp and odometer, and let the sheet/user figure it out.
        // Legend said: "Elk uur een nieuwe regel (ook als je maar 5km hebt gereden)? Resultaat: Veel regels per dag. Eén regel per dag die ik steeds update? Resultaat: Lekker overzichtelijk".
        // He hasn't answered yet, but "update" is harder with `appendToSheet`.
        // Let's implement append for now, but only if odometer changed since last successful sync.
        
        // To do that, we need to know what the odometer was at the LAST sync.
        // `lastReading` (fetched at start of loop) holds the latest entry in DB.
        // If we successfully upserted just now, `lastReading` is now outdated.
        // But `baseOdometer` is what we compared against.
        
        // If daily_km > 0, it means odometer > baseOdometer.
        // So we have movement.
        
        if (dailyKm > 0) {
            // Check if we already logged this odometer value (to prevent duplicates if cron runs but car didn't move further)
            // Actually, if car didn't move, odometerKm == baseOdometer, so dailyKm == 0.
            // So if dailyKm > 0, we have new distance.
            
            // Wait, if we run at 10:00 and drive 10km (daily_km=10). Logged.
            // Run at 11:00, still 10km driven total today (car parked). daily_km=10.
            // We don't want to log 10km AGAIN.
            
            // We need to know if the odometer changed *since the last sync execution*.
            // `vehicle_sync_status` table tracks `last_successful_sync`.
            // But it doesn't store the odometer of that sync.
            
            // We can look at `mileage_readings` metadata?
            // "end_odometer_km" is updated on every sync.
            // If we fetch `lastReading` BEFORE the upsert/update (which we did),
            // and `odometerKm` (current) > `lastReading.odometer_km`, THEN we have new movement.
            
            // `lastReading` was fetched at start of loop.
            const previousStoredOdometer = lastReading?.odometer_km || 0;
            const kmSinceLastSync = odometerKm - previousStoredOdometer;
            
            if (kmSinceLastSync > 0) {
                console.log(`[tesla-sync-all] New movement detected (${kmSinceLastSync} km). Appending to sheet.`);
                
                // Get the start location from today's trip record (if available)
                let sheetStartLocation = 'Onbekend';
                try {
                  const { data: todayTrip } = await supabase
                    .from('trips')
                    .select('start_location, end_location')
                    .eq('vehicle_id', vehicle.id)
                    .eq('user_id', userId)
                    .gte('started_at', `${today}T00:00:00`)
                    .lte('started_at', `${today}T23:59:59`)
                    .order('started_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (todayTrip?.start_location) sheetStartLocation = todayTrip.start_location;
                } catch (e) {
                  // ignore
                }

                const sheetRow = [
                    toDateStr(now),
                    toTimeStr(now),
                    vehicle.license_plate || vehicle.vin || vehicleName,
                    previousStoredOdometer,
                    odometerKm,
                    kmSinceLastSync,
                    sheetStartLocation,
                    locationName || "Onbekend",
                    "Privé" // Default — user changes in app
                ];

                try {
                    await appendToSheet(SPREADSHEET_ID, `${SHEET_NAME}!A:I`, sheetRow);
                    console.log('[tesla-sync-all] Logged to Google Sheet');
                } catch (sheetError) {
                    console.error('[tesla-sync-all] Failed to log to sheet:', sheetError);
                    // Don't fail the whole sync for sheet error
                }
            } else {
                 console.log(`[tesla-sync-all] No new movement since last sync (Odo: ${odometerKm}). Skipping sheet log.`);
            }
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      failed++;
      errors.push(`${vehicleName}: ${errorMsg}`);
      await updateSyncStatus(supabase, vehicle.id, userId, false, false, errorMsg);
    }
  }

  return { synced, failed, offline, errors };
}

// Get tokens from the pgsodium vault (store_tesla_tokens / get_tesla_access_token RPCs).
// Falls back to profiles table for any users who haven't reconnected yet.
async function getTokensFromVault(
  supabase: any,
  userId: string
): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null }> {

  // Primary: pgsodium vault via RPC (set by tesla-auth)
  const { data: accessToken, error: atError } = await supabase.rpc('get_tesla_access_token', {
    p_user_id: userId,
  });
  const { data: refreshToken, error: rtError } = await supabase.rpc('get_tesla_refresh_token', {
    p_user_id: userId,
  });

  if (!atError && accessToken) {
    // Get expiry from profiles (non-sensitive column)
    const { data: profile } = await supabase
      .from('profiles')
      .select('tesla_token_expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    const expiresAt = profile?.tesla_token_expires_at
      ? new Date(profile.tesla_token_expires_at)
      : null;

    return { accessToken, refreshToken: refreshToken || null, expiresAt };
  }

  console.log(`[tesla-sync-all] No vault tokens for user ${userId}, no fallback available`);
  return { accessToken: null, refreshToken: null, expiresAt: null };
}

async function getValidAccessToken(
  supabase: any,
  userId: string,
  accessToken: string | null,
  refreshToken: string | null,
  expiresAt: Date | null,
  clientId: string,
  clientSecret: string
): Promise<{ token: string | null; refreshed: boolean }> {
  if (!accessToken) {
    return { token: null, refreshed: false };
  }

  const bufferTime = 5 * 60 * 1000;
  if (expiresAt && expiresAt.getTime() - bufferTime < Date.now()) {
    console.log(`[tesla-sync-all] Token expired for user ${userId}, refreshing...`);

    if (!refreshToken) {
      console.error(`[tesla-sync-all] No refresh token for user ${userId}`);
      return { token: null, refreshed: false };
    }

    try {
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
        console.error(`[tesla-sync-all] Token refresh failed for user ${userId}:`, errorText);
        return { token: null, refreshed: false };
      }

      const tokens = await refreshResponse.json();

      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

      // Store refreshed tokens back in pgsodium vault
      await supabase.rpc('store_tesla_tokens', {
        p_user_id: userId,
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_expires_at: newExpiresAt,
      });

      await logAuditEvent(supabase, userId, 'TOKEN_REFRESH', 'tesla_auth', undefined, { success: true });

      console.log(`[tesla-sync-all] Token refreshed and stored for user ${userId}`);
      return { token: tokens.access_token, refreshed: true };

    } catch (error) {
      console.error(`[tesla-sync-all] Token refresh error for user ${userId}:`, error);
      return { token: null, refreshed: false };
    }
  }

  return { token: accessToken, refreshed: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    
    if (!cronSecret || providedSecret !== cronSecret) {
      console.error('[tesla-sync-all] Unauthorized: Invalid or missing cron secret');
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Invalid or missing cron secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-sync-all] Starting multi-user Tesla sync...');
    const startTime = Date.now();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL') || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    if (!clientId || !clientSecret) {
      console.error('[tesla-sync-all] Missing Tesla credentials');
      return new Response(
        JSON.stringify({ error: 'configuration_error', message: 'Tesla credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all users who have an active vehicle (meaning they've connected Tesla)
    // Tokens are stored in pgsodium vault; we identify users via the vehicles table
    const { data: activeVehicleUsers } = await supabase
      .from('vehicles')
      .select('user_id')
      .eq('is_active', true);

    // Deduplicate user IDs
    const userIds = new Set<string>();
    activeVehicleUsers?.forEach((v: { user_id: string }) => userIds.add(v.user_id));

    console.log(`[tesla-sync-all] Found ${userIds.size} users with Tesla tokens`);

    let totalSynced = 0;
    let totalFailed = 0;
    let totalOffline = 0;
    const allErrors: string[] = [];

    for (const userId of userIds) {
      try {
        console.log(`[tesla-sync-all] Processing user ${userId}`);
        
        const { accessToken, refreshToken, expiresAt } = await getTokensFromVault(supabase, userId);
        
        if (!accessToken) {
          console.log(`[tesla-sync-all] No valid tokens for user ${userId}`);
          continue;
        }

        const { token: validToken, refreshed } = await getValidAccessToken(
          supabase, userId, accessToken, refreshToken, expiresAt, clientId, clientSecret
        );

        if (!validToken) {
          console.error(`[tesla-sync-all] Could not get valid token for user ${userId}`);
          continue;
        }

        const result = await syncUserVehicles(supabase, userId, validToken, teslaApiBaseUrl);
        
        totalSynced += result.synced;
        totalFailed += result.failed;
        totalOffline += result.offline;
        allErrors.push(...result.errors);

        console.log(`[tesla-sync-all] User ${userId}: synced=${result.synced}, failed=${result.failed}, offline=${result.offline}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-sync-all] Error processing user ${userId}:`, errorMsg);
        allErrors.push(`User ${userId}: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[tesla-sync-all] Completed in ${duration}ms: synced=${totalSynced}, failed=${totalFailed}, offline=${totalOffline}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Multi-user sync completed`,
        duration_ms: duration,
        total_users: userIds.size,
        synced: totalSynced,
        failed: totalFailed,
        offline: totalOffline,
        errors: allErrors.length > 0 ? allErrors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-sync-all] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'server_error', message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
