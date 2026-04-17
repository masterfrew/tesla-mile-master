import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { reverseGeocode } from '../_shared/geocoding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create or update a daily trip record in the `trips` table.
 * If a trip already exists for this vehicle+day, update the end location.
 * If not, create a new trip using the previous trip's end location as start.
 */
async function upsertDailyTrip(
  supabase: any,
  params: {
    vehicleId: string;
    userId: string;
    date: string;
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
  const { vehicleId, userId, date, startOdometer, endOdometer, dailyKm, latitude, longitude, locationName, geocodeResult, now } = params;

  try {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id, start_lat, start_lon, start_location, start_odometer_km')
      .eq('vehicle_id', vehicleId)
      .eq('user_id', userId)
      .eq('is_manual', false)
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTrip) {
      // Update end location
      const updateData: Record<string, any> = {
        ended_at: now.toISOString(),
        end_odometer_km: endOdometer,
        updated_at: now.toISOString(),
        metadata: {
          last_sync: now.toISOString(),
          daily_km: dailyKm,
          geocode_end: geocodeResult ? {
            display_name: geocodeResult.displayName,
            city: geocodeResult.city,
            road: geocodeResult.road,
          } : null,
        },
      };

      if (latitude && longitude) {
        updateData.end_lat = latitude;
        updateData.end_lon = longitude;
        updateData.end_location = locationName;
      }

      await supabase.from('trips').update(updateData).eq('id', existingTrip.id);
      console.log(`[tesla-mileage] Updated trip ${existingTrip.id} end: ${locationName}`);
    } else {
      // Get previous trip's end location to use as this trip's start
      const { data: prevTrip } = await supabase
        .from('trips')
        .select('end_lat, end_lon, end_location')
        .eq('vehicle_id', vehicleId)
        .eq('user_id', userId)
        .eq('is_manual', false)
        .lt('started_at', dayStart)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let startLocation = prevTrip?.end_location || null;
      let startLat = prevTrip?.end_lat || null;
      let startLon = prevTrip?.end_lon || null;

      // If we have previous coords but no location, try geocoding them
      if (startLat && startLon && !startLocation) {
        try {
          await sleep(1100); // Nominatim rate limit
          const geo = await reverseGeocode(startLat, startLon);
          if (geo) startLocation = geo.shortName;
        } catch (e) {
          console.error('[tesla-mileage] Start geocoding failed:', e);
        }
      }

      const tripData: Record<string, any> = {
        vehicle_id: vehicleId,
        user_id: userId,
        started_at: `${date}T00:00:00.000Z`,
        ended_at: now.toISOString(),
        start_odometer_km: startOdometer,
        end_odometer_km: endOdometer,
        start_location: startLocation,
        start_lat: startLat,
        start_lon: startLon,
        end_location: locationName,
        end_lat: latitude,
        end_lon: longitude,
        purpose: 'business',
        is_manual: false,
        metadata: {
          created_by: 'tesla-mileage',
          last_sync: now.toISOString(),
          daily_km: dailyKm,
          geocode_end: geocodeResult ? {
            display_name: geocodeResult.displayName,
            city: geocodeResult.city,
            road: geocodeResult.road,
          } : null,
        },
      };

      const { error: insertError } = await supabase.from('trips').insert(tripData);
      if (insertError) {
        console.error('[tesla-mileage] Failed to create trip:', insertError);
      } else {
        console.log(`[tesla-mileage] Created trip: ${startLocation || '?'} → ${locationName || '?'} (${dailyKm} km)`);
      }
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

    // Get access token from pgsodium vault
    const { data: accessToken, error: tokenError } = await supabase.rpc('get_tesla_access_token', {
      p_user_id: user.id,
    });

    if (tokenError || !accessToken) {
      console.error('[tesla-mileage] No vault token:', tokenError);
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
          `${teslaApiBaseUrl}/api/1/vehicles/${vehicle.tesla_vehicle_id}/vehicle_data`,
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
        const latitude = driveState.latitude || null;
        const longitude = driveState.longitude || null;
        const heading = driveState.heading || null;
        const speed = driveState.speed || null;
        const activeRouteDestination = driveState.active_route_destination || null;

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
            if (!locationName) {
              locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
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
          await upsertDailyTrip(supabase, {
            vehicleId: vehicle.id,
            userId: user.id,
            date: today,
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
