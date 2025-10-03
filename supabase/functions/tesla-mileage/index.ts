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
    console.log('Fetching Tesla mileage data...');

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Failed to get user:', userError);
      throw new Error('User not authenticated');
    }

    console.log('Getting vehicles and access token for user:', user.id);

    // Get access token from vault
    const { data: accessToken, error: tokenError } = await supabase.rpc('get_tesla_access_token', {
      p_user_id: user.id,
    });

    if (tokenError || !accessToken) {
      console.error('Failed to get access token:', tokenError);
      throw new Error('No Tesla access token found');
    }

    // Get user's vehicles
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, tesla_vehicle_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (vehiclesError) {
      console.error('Failed to get vehicles:', vehiclesError);
      throw vehiclesError;
    }

    if (!vehicles || vehicles.length === 0) {
      console.log('No vehicles found for user');
      return new Response(
        JSON.stringify({ success: true, message: 'No vehicles to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Syncing mileage for ${vehicles.length} vehicles`);
    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL')
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
    let synced = 0;

    // Fetch and store mileage for each vehicle
    for (const vehicle of vehicles) {
      try {
        // Fetch vehicle data from Tesla API
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
          console.error(`Failed to fetch data for vehicle ${vehicle.tesla_vehicle_id}`);
          console.error('Tesla API base URL used:', teslaApiBaseUrl);
          continue;
        }

        const vehicleData = await vehicleDataResponse.json();
        const odometerMiles = vehicleData.response?.vehicle_state?.odometer;

        if (!odometerMiles) {
          console.log(`No odometer data for vehicle ${vehicle.tesla_vehicle_id}`);
          continue;
        }

        // Convert miles to kilometers
        const odometerKm = Math.round(odometerMiles * 1.60934);
        const today = new Date().toISOString().split('T')[0];

        // Get previous reading to calculate daily km
        const { data: prevReading } = await supabase
          .from('mileage_readings')
          .select('odometer_km')
          .eq('vehicle_id', vehicle.id)
          .order('reading_date', { ascending: false })
          .limit(1)
          .single();

        const dailyKm = prevReading 
          ? Math.max(0, odometerKm - prevReading.odometer_km)
          : 0;

        // Store mileage reading
        const { error: insertError } = await supabase
          .from('mileage_readings')
          .insert({
            vehicle_id: vehicle.id,
            user_id: user.id,
            reading_date: today,
            odometer_km: odometerKm,
            daily_km: dailyKm,
          });

        if (insertError) {
          console.error('Failed to insert mileage reading:', insertError);
        } else {
          console.log(`Stored mileage for vehicle ${vehicle.tesla_vehicle_id}: ${odometerKm} km`);
          synced++;
        }

      } catch (error) {
        console.error(`Error processing vehicle ${vehicle.tesla_vehicle_id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        synced_vehicles: synced
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tesla-mileage:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
