import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { reverseGeocode } from '../_shared/geocoding.ts';
import { decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create or update a trip record per drive segment.
 * Creates a NEW trip when the car has moved to a different location.
 * Otherwise updates the current open trip with latest odometer/time.
 */
async function upsertTrip(
  supabase: any,
  params: {
    vehicleId: string;
    userId: string;
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
  const { vehicleId, userId, startOdometer, endOdometer, dailyKm, latitude, longitude, locationName, geocodeResult, now } = params;

  try {
    const nowIso = now.toISOString();

    // Find the most recent trip for this vehicle
    const { data: lastTrip } = await supabase
      .from('trips')
      .select('id, end_location, ended_at, end_odometer_km')
      .eq('vehicle_id', vehicleId)
      .eq('user_id', userId)
      .eq('is_manual', false)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastTrip) {
      // First ever trip — create it
      const insertData: Record<string, any> = {
        vehicle_id: vehicleId,
        user_id: userId,
        started_at: nowIso,
        ended_at: nowIso,
        start_odometer_km: endOdometer,
        end_odometer_km: endOdometer,
        start_location: locationName,
        end_location: locationName,
        start_lat: latitude,
        start_lon: longitude,
        end_lat: latitude,
        end_lon: longitude,
        purpose: 'business',
        is_manual: false,
        metadata: { first_sync: true, created_at: nowIso },
      };
      await supabase.from('trips').insert(insertData);
      console.log(`[tesla-mileage] Created first trip at ${locationName || '?'} (${endOdometer} km)`);
      return;
    }

    // Is the location significantly different from the last trip's end location?
    const lastLoc = lastTrip.end_location || '';
    const newLoc = locationName || '';
    const locationChanged = newLoc && lastLoc &&
      newLoc.toLowerCase() !== lastLoc.toLowerCase() &&
      !newLoc.includes(lastLoc) && !lastLoc.includes(newLoc);

    // If location changed, close the last trip and start a new one
    if (locationChanged) {
      // Close the last trip
      if (!lastTrip.ended_at || lastTrip.ended_at === lastTrip.started_at) {
        await supabase.from('trips').update({
          ended_at: nowIso,
          end_odometer_km: startOdometer,
          end_location: locationName,
          end_lat: latitude,
          end_lon: longitude,
          updated_at: nowIso,
          metadata: {
            last_sync: nowIso,
            daily_km: dailyKm,
            closed_by: 'location_change',
            geocode_end: geocodeResult ? {
              display_name: geocodeResult.displayName,
              city: geocodeResult.city,
              road: geocodeResult.road,
            } : null,
          },
        }).eq('id', lastTrip.id);
        console.log(`[tesla-mileage] Closed trip ${lastTrip.id} at ${locationName}`);
      }

      // Create new trip
      const insertData: Record<string, any> = {
        vehicle_id: vehicleId,
        user_id: userId,
        started_at: nowIso,
        ended_at: nowIso,
        start_odometer_km: startOdometer,
        end_odometer_km: endOdometer,
        start_location: locationName,
        end_location: locationName,
        start_lat: latitude,
        start_lon: longitude,
        end_lat: latitude,
        end_lon: longitude,
        purpose: 'business',
        is_manual: false,
        metadata: {
          created_by: 'tesla-mileage',
          last_sync: nowIso,
          daily_km: dailyKm,
          geocode_end: geocodeResult ? {
            display_name: geocodeResult.displayName,
            city: geocodeResult.city,
            road: geocodeResult.road,
          } : null,
        },
      };
      await supabase.from('trips').insert(insertData);
      console.log(`[tesla-mileage] Created trip: ${locationName || '?'} (${endOdometer} km)`);
    } else {
      // Same-ish location — just update the last trip's end data
      await supabase.from('trips').update({
        ended_at: nowIso,
        end_odometer_km: endOdometer,
        end_location: locationName,
        end_lat: latitude,
        end_lon: longitude,
        updated_at: nowIso,
        metadata: {
          last_sync: nowIso,
          daily_km: dailyKm,
          geocode_end: geocodeResult ? {
            display_name: geocodeResult.displayName,
            city: geocodeResult.city,
            road: geocodeResult.road,
          } : null,
        },
      }).eq('id', lastTrip.id);
      console.log(`[tesla-mileage] Updated trip ${lastTrip.id}: ${locationName || '?'} @ ${endOdometer} km`);
    }
  } catch (error) {
    console.error('[tesla-mileage] Trip upsert error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-mileage] Starting sync...');

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
      console.error('[tesla-mileage] User auth failed:', userError);
      throw new Error('User not authenticated');
    }

    console.log('[tesla-mileage] User:', user.id);

    // Get access token from encrypted_tesla_tokens table
    const { data: encRows, error: tokenError } = await supabase.rpc('get_encrypted_tesla_tokens', {
      p_user_id: user.id,
    });

    if (tokenError || !encRows || encRows.length === 0) {
      console.error('[tesla-mileage] No encrypted token found:', tokenError);
      throw new Error('No Tesla access token found. Please reconnect your Tesla account.');
    }

    let accessToken: string | null = null;
    try {
      accessToken = encRows[0].encrypted_access_token
        ? await decryptToken(encRows[0].encrypted_access_token)
        : null;
    } catch (decErr) {
      console.error('[tesla-mileage] Token decryption failed:', decErr);
    }

    if (!accessToken) {
      console.error('[tesla-mileage] Could not decrypt access token');
      throw new Error('No Tesla access token found. Please reconnect your Tesla account.');
    }

    // Get user's vehicles
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, tesla_vehicle_id, display_name')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (vehiclesError) throw vehiclesError;

    if (!vehicles || vehicles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: 'No vehicles to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL')
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
    let synced = 0;

    for (const vehicle of vehicles) {
      try {
        console.log(`[tesla-mileage] Fetching data for vehicle ${vehicle.tesla_vehicle_id}`);

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
          const errText = await vehicleDataResponse.text();
          console.error(`[tesla-mileage] Tesla API error ${vehicleDataResponse.status}:`, errText);
          continue;
        }

        const vehicleData = await vehicleDataResponse.json();
        const odometerMiles = vehicleData.response?.vehicle_state?.odometer;

        if (!odometerMiles) {
          console.log(`[tesla-mileage] No odometer data for ${vehicle.tesla_vehicle_id}`);
          continue;
        }

        const odometerKm = Math.round(odometerMiles * 1.60934);
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        const driveState = vehicleData.response?.drive_state || {};
        let latitude = driveState.latitude || null;
        let longitude = driveState.longitude || null;
        const heading = driveState.heading || null;
        const speed = driveState.speed || null;
        const activeRouteDestination = driveState.active_route_destination || null;

        // If GPS is null (car asleep), fall back to last known position
        if (!latitude || !longitude) {
          const { data: lastGpsReading } = await supabase
            .from('mileage_readings')
            .select('metadata')
            .eq('vehicle_id', vehicle.id)
            .not('metadata', 'is', null)
            .order('reading_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastGpsReading?.metadata) {
            const meta = lastGpsReading.metadata;
            const fbLat = meta.latitude ?? meta.lat ?? null;
            const fbLon = meta.longitude ?? meta.lon ?? null;
            if (fbLat && fbLon) {
              latitude = fbLat;
              longitude = fbLon;
              console.log(`[tesla-mileage] GPS null, using last known: ${latitude},${longitude}`);
            }
          }
        }

        // Reverse geocode current position
        let locationName: string | null = activeRouteDestination;
        let geocodeResult = null;
        if (latitude && longitude) {
          try {
            geocodeResult = await reverseGeocode(latitude, longitude);
            if (geocodeResult) {
              locationName = geocodeResult.shortName;
              console.log(`[tesla-mileage] Geocoded → ${locationName}`);
            }
          } catch (geoError) {
            console.error('[tesla-mileage] Geocoding failed:', geoError);
          }
          // Always store coordinates as fallback if geocoding failed
          if (!locationName) {
            locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          }
          // Respect Nominatim rate limit
          await sleep(1100);
        }

        // Get previous reading for daily delta
        const { data: prevReading } = await supabase
          .from('mileage_readings')
          .select('odometer_km, reading_date')
          .eq('vehicle_id', vehicle.id)
          .order('reading_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const prevOdometer = prevReading?.odometer_km || odometerKm;
        const dailyKm = Math.max(0, odometerKm - prevOdometer);

        // Upsert mileage reading
        const { error: insertError } = await supabase
          .from('mileage_readings')
          .upsert({
            vehicle_id: vehicle.id,
            user_id: user.id,
            reading_date: today,
            odometer_km: odometerKm,
            daily_km: dailyKm,
            location_name: locationName,
            metadata: {
              synced_at: now.toISOString(),
              latitude,
              longitude,
              heading,
              speed,
              start_odometer_km: prevOdometer,
              end_odometer_km: odometerKm,
              geocode: geocodeResult ? {
                display_name: geocodeResult.displayName,
                short_name: geocodeResult.shortName,
                city: geocodeResult.city,
                road: geocodeResult.road,
                postcode: geocodeResult.postcode,
              } : null,
            },
          }, { onConflict: 'vehicle_id,reading_date' });

        if (insertError) {
          console.error('[tesla-mileage] Failed to insert mileage reading:', insertError);
        } else {
          synced++;
          console.log(`[tesla-mileage] Mileage stored: ${odometerKm} km, +${dailyKm} km today`);

          // Also create/update trip record for rich start/end location display
          await upsertTrip(supabase, {
            vehicleId: vehicle.id,
            userId: user.id,
            startOdometer: prevOdometer,
            endOdometer: odometerKm,
            dailyKm,
            latitude,
            longitude,
            locationName,
            geocodeResult,
            now,
          });
        }

      } catch (error) {
        console.error(`[tesla-mileage] Error for vehicle ${vehicle.tesla_vehicle_id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[tesla-mileage] Fatal error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
