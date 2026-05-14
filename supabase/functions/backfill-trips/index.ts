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
 * backfill-trips
 *
 * Creates trip records for all mileage_readings rows that don't already have
 * a corresponding trip. Called by the user after connect/sync to fill in
 * historical gaps.
 *
 * NOTE: The mileage_readings table uses "reading_date" (not "date") as the
 * date column name.
 */

interface MileageReading {
  id: string;
  vehicle_id: string;
  reading_date: string; // YYYY-MM-DD  ← correct column name
  daily_km: number;
  odometer_km: number;
  location_name: string | null;
  metadata: Record<string, any> | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[backfill-trips] Starting...');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[backfill-trips] Auth failed:', userError);
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[backfill-trips] User:', user.id);

    // ── 1. Get all mileage_readings with km > 0, ordered by vehicle + reading_date ──
    const { data: readings, error: readingsError } = await supabase
      .from('mileage_readings')
      .select('id, vehicle_id, reading_date, daily_km, odometer_km, location_name, metadata')
      .eq('user_id', user.id)
      .gt('daily_km', 0)
      .order('vehicle_id')
      .order('reading_date', { ascending: true });

    if (readingsError) {
      throw new Error(`Failed to fetch mileage_readings: ${readingsError.message}`);
    }

    if (!readings || readings.length === 0) {
      console.log('[backfill-trips] No mileage readings found');
      return new Response(JSON.stringify({ created: 0, skipped: 0, message: 'Geen rijdata gevonden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[backfill-trips] Found ${readings.length} mileage readings`);

    // ── 2. Get existing auto-generated trip dates per vehicle ─────────────────
    const { data: existingTrips, error: tripsError } = await supabase
      .from('trips')
      .select('vehicle_id, started_at')
      .eq('user_id', user.id)
      .eq('is_manual', false);

    if (tripsError) {
      throw new Error(`Failed to fetch trips: ${tripsError.message}`);
    }

    // Build a Set of "vehicleId|YYYY-MM-DD" for quick lookup
    const existingTripDates = new Set<string>();
    for (const trip of existingTrips || []) {
      const d = new Date(trip.started_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      existingTripDates.add(`${trip.vehicle_id}|${dateStr}`);
    }

    console.log(`[backfill-trips] ${existingTripDates.size} existing trip days to skip`);

    // ── 3. Group readings by vehicle_id for prev-day lookup ──────────────────
    const byVehicle: Record<string, MileageReading[]> = {};
    for (const r of readings as MileageReading[]) {
      if (!byVehicle[r.vehicle_id]) byVehicle[r.vehicle_id] = [];
      byVehicle[r.vehicle_id].push(r);
    }

    let created = 0;
    let skipped = 0;

    // ── 4. For each vehicle, process readings chronologically ─────────────────
    for (const [vehicleId, vehicleReadings] of Object.entries(byVehicle)) {
      for (let i = 0; i < vehicleReadings.length; i++) {
        const reading = vehicleReadings[i];
        const lookupKey = `${vehicleId}|${reading.reading_date}`;

        if (existingTripDates.has(lookupKey)) {
          skipped++;
          continue;
        }

        // Previous reading (for start location/odometer)
        const prev = i > 0 ? vehicleReadings[i - 1] : null;

        const endOdometer = reading.odometer_km;
        const startOdometer = prev ? prev.odometer_km : Math.max(0, endOdometer - reading.daily_km);

        // End location: from reading
        let endLocation = reading.location_name || null;
        let endLat: number | null = null;
        let endLon: number | null = null;

        if (reading.metadata) {
          endLat = reading.metadata.latitude ?? reading.metadata.lat ?? null;
          endLon = reading.metadata.longitude ?? reading.metadata.lon ?? null;
        }

        // If we have coordinates but no location name, geocode it
        if (endLat && endLon && !endLocation) {
          try {
            await sleep(1100);
            const geo = await reverseGeocode(endLat, endLon);
            if (geo) endLocation = geo.shortName;
          } catch (e) {
            console.error(`[backfill-trips] Geocoding failed for ${reading.reading_date}:`, e);
          }
        }

        // Start location: from previous reading
        let startLocation = prev?.location_name || null;
        let startLat: number | null = null;
        let startLon: number | null = null;

        if (prev?.metadata) {
          startLat = prev.metadata.latitude ?? prev.metadata.lat ?? null;
          startLon = prev.metadata.longitude ?? prev.metadata.lon ?? null;
        }

        const tripData = {
          vehicle_id: vehicleId,
          user_id: user.id,
          started_at: `${reading.reading_date}T00:00:00.000Z`,
          ended_at: `${reading.reading_date}T23:59:59.000Z`,
          start_odometer_km: startOdometer,
          end_odometer_km: endOdometer,
          start_location: startLocation,
          start_lat: startLat,
          start_lon: startLon,
          end_location: endLocation,
          end_lat: endLat,
          end_lon: endLon,
          purpose: 'business',
          is_manual: false,
          metadata: {
            created_by: 'backfill-trips',
            mileage_reading_id: reading.id,
            daily_km: reading.daily_km,
          },
        };

        const { error: insertError } = await supabase.from('trips').insert(tripData);
        if (insertError) {
          console.error(`[backfill-trips] Insert failed for ${reading.reading_date}:`, insertError.message);
          skipped++;
        } else {
          console.log(`[backfill-trips] Created trip: ${reading.reading_date} ${startLocation || '?'} → ${endLocation || '?'} (${reading.daily_km} km)`);
          existingTripDates.add(lookupKey);
          created++;
        }
      }
    }

    console.log(`[backfill-trips] Done: ${created} created, ${skipped} skipped`);

    return new Response(
      JSON.stringify({ created, skipped, message: `${created} ritten aangemaakt, ${skipped} overgeslagen` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[backfill-trips] Unhandled error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
