import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to sync a single user's vehicles
async function syncUserVehicles(
  supabase: any,
  userId: string,
  accessToken: string,
  teslaApiBaseUrl: string
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  // Get user's vehicles
  const { data: vehicles, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('id, tesla_vehicle_id, display_name, vin')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (vehiclesError || !vehicles || vehicles.length === 0) {
    console.log(`[tesla-sync-all] No vehicles for user ${userId}`);
    return { synced: 0, errors: [] };
  }

  for (const vehicle of vehicles) {
    try {
      console.log(`[tesla-sync-all] Fetching data for vehicle ${vehicle.tesla_vehicle_id}`);
      
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
        console.error(`[tesla-sync-all] Failed to fetch vehicle ${vehicle.tesla_vehicle_id}:`, errorText);
        errors.push(`${vehicle.display_name || vehicle.vin}: API error (${vehicleDataResponse.status})`);
        continue;
      }

      const vehicleData = await vehicleDataResponse.json();
      const odometerMiles = vehicleData.response?.vehicle_state?.odometer;

      if (!odometerMiles) {
        errors.push(`${vehicle.display_name || vehicle.vin}: no odometer data`);
        continue;
      }

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

      // Check if we already have a reading for today
      const { data: existingReading } = await supabase
        .from('mileage_readings')
        .select('id')
        .eq('vehicle_id', vehicle.id)
        .eq('reading_date', today)
        .single();

      if (existingReading) {
        // Update existing reading
        const { error: updateError } = await supabase
          .from('mileage_readings')
          .update({
            odometer_km: odometerKm,
            daily_km: dailyKm,
          })
          .eq('id', existingReading.id);

        if (updateError) {
          errors.push(`${vehicle.display_name || vehicle.vin}: update failed`);
        } else {
          synced++;
        }
      } else {
        // Insert new reading
        const { error: insertError } = await supabase
          .from('mileage_readings')
          .insert({
            vehicle_id: vehicle.id,
            user_id: userId,
            reading_date: today,
            odometer_km: odometerKm,
            daily_km: dailyKm,
          });

        if (insertError) {
          errors.push(`${vehicle.display_name || vehicle.vin}: insert failed`);
        } else {
          synced++;
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${vehicle.display_name || vehicle.vin}: ${errorMsg}`);
    }
  }

  return { synced, errors };
}

// Helper function to refresh token if needed
async function getValidAccessToken(
  supabase: any,
  profile: any,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  let accessToken = profile.tesla_access_token;
  const expiresAt = profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null;
  
  // Check if token is expired or will expire in the next 5 minutes
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  if (expiresAt && expiresAt.getTime() - bufferTime < Date.now()) {
    console.log(`[tesla-sync-all] Token expired for user ${profile.user_id}, refreshing...`);
    
    if (!profile.tesla_refresh_token) {
      console.error(`[tesla-sync-all] No refresh token for user ${profile.user_id}`);
      return null;
    }

    try {
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
        console.error(`[tesla-sync-all] Token refresh failed for user ${profile.user_id}`);
        return null;
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      // Store refreshed tokens
      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
      await supabase.rpc('store_tesla_tokens', {
        p_user_id: profile.user_id,
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_expires_at: newExpiresAt
      });

      console.log(`[tesla-sync-all] Token refreshed for user ${profile.user_id}`);
    } catch (error) {
      console.error(`[tesla-sync-all] Token refresh error for user ${profile.user_id}:`, error);
      return null;
    }
  }

  return accessToken;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-sync-all] Starting multi-user Tesla sync...');
    const startTime = Date.now();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL') 
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    if (!clientId || !clientSecret) {
      console.error('[tesla-sync-all] Missing Tesla credentials');
      return new Response(
        JSON.stringify({ error: 'configuration_error', message: 'Tesla credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all users with Tesla tokens
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
      .not('tesla_access_token', 'is', null);

    if (profilesError) {
      console.error('[tesla-sync-all] Failed to get profiles:', profilesError);
      return new Response(
        JSON.stringify({ error: 'database_error', message: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profiles || profiles.length === 0) {
      console.log('[tesla-sync-all] No users with Tesla tokens found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No users to sync',
          total_users: 0,
          synced_vehicles: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[tesla-sync-all] Found ${profiles.length} users with Tesla tokens`);

    let totalSynced = 0;
    let usersProcessed = 0;
    let usersFailed = 0;
    const allErrors: string[] = [];

    // Process each user
    for (const profile of profiles) {
      try {
        console.log(`[tesla-sync-all] Processing user ${profile.user_id}`);
        
        // Get valid access token (refresh if needed)
        const accessToken = await getValidAccessToken(supabase, profile, clientId, clientSecret);
        
        if (!accessToken) {
          console.error(`[tesla-sync-all] Could not get valid token for user ${profile.user_id}`);
          usersFailed++;
          allErrors.push(`User ${profile.user_id}: token invalid`);
          continue;
        }

        // Sync user's vehicles
        const { synced, errors } = await syncUserVehicles(
          supabase,
          profile.user_id,
          accessToken,
          teslaApiBaseUrl
        );

        totalSynced += synced;
        usersProcessed++;
        
        if (errors.length > 0) {
          allErrors.push(...errors.map(e => `User ${profile.user_id}: ${e}`));
        }

        console.log(`[tesla-sync-all] User ${profile.user_id}: ${synced} vehicles synced`);

        // Small delay between users to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-sync-all] Error processing user ${profile.user_id}:`, errorMsg);
        usersFailed++;
        allErrors.push(`User ${profile.user_id}: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[tesla-sync-all] Completed in ${duration}ms: ${usersProcessed}/${profiles.length} users, ${totalSynced} vehicles synced`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Synced ${totalSynced} vehicles for ${usersProcessed} users`,
        total_users: profiles.length,
        users_processed: usersProcessed,
        users_failed: usersFailed,
        synced_vehicles: totalSynced,
        duration_ms: duration,
        errors: allErrors.length > 0 ? allErrors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-sync-all] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Sync failed',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
