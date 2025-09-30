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
    console.log('Fetching Tesla vehicles...');

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

    console.log('Getting access token for user:', user.id);

    // Get access token from vault
    const { data: accessToken, error: tokenError } = await supabase.rpc('get_tesla_access_token', {
      p_user_id: user.id,
    });

    if (tokenError || !accessToken) {
      console.error('Failed to get access token:', tokenError);
      throw new Error('No Tesla access token found');
    }

    console.log('Fetching vehicles from Tesla API...');

    // Fetch vehicles from Tesla API
    const vehiclesResponse = await fetch('https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vehiclesResponse.ok) {
      const errorText = await vehiclesResponse.text();
      console.error('Tesla API error:', errorText);
      throw new Error(`Failed to fetch vehicles: ${errorText}`);
    }

    const vehiclesData = await vehiclesResponse.json();
    console.log(`Found ${vehiclesData.response?.length || 0} vehicles`);

    // Store vehicles in database
    const vehicles = vehiclesData.response || [];
    
    for (const vehicle of vehicles) {
      const { error: upsertError } = await supabase
        .from('vehicles')
        .upsert({
          user_id: user.id,
          tesla_vehicle_id: vehicle.id,
          vin: vehicle.vin,
          display_name: vehicle.display_name,
          model: vehicle.vehicle_config?.car_type || null,
          color: vehicle.vehicle_config?.exterior_color || null,
          year: vehicle.vehicle_config?.year || null,
          is_active: true,
        }, {
          onConflict: 'user_id,tesla_vehicle_id',
        });

      if (upsertError) {
        console.error('Failed to upsert vehicle:', upsertError);
      } else {
        console.log('Stored vehicle:', vehicle.vin);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        vehicles_count: vehicles.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in tesla-vehicles:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
