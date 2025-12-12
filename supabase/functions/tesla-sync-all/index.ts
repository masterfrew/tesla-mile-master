import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Helper function to detect offline vehicle states
function isVehicleOfflineError(status: number, errorText: string): boolean {
  const offlineIndicators = [
    'vehicle unavailable',
    'vehicle is offline',
    'timeout',
    'asleep',
    'could not wake',
    '408', // Request timeout
    '504', // Gateway timeout
  ];
  
  if (status === 408 || status === 504) return true;
  
  const lowerError = errorText.toLowerCase();
  return offlineIndicators.some(indicator => lowerError.includes(indicator.toLowerCase()));
}

// Helper function with retry logic for offline vehicles
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
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      return { 
        success: false, 
        isOffline, 
        error: `API error (${response.status}): ${errorText.substring(0, 100)}` 
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isOffline = isVehicleOfflineError(0, errorMsg);
      
      if (attempt < retries) {
        console.log(`[tesla-sync-all] Request failed, retrying... Error: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      return { success: false, isOffline, error: errorMsg };
    }
  }
  
  return { success: false, isOffline: true, error: 'Max retries exceeded' };
}

// Helper function to update sync status
async function updateSyncStatus(
  supabase: any,
  vehicleId: string,
  userId: string,
  success: boolean,
  isOffline: boolean,
  errorMsg?: string
) {
  const now = new Date().toISOString();
  
  // Try to get existing sync status
  const { data: existingStatus } = await supabase
    .from('vehicle_sync_status')
    .select('id, consecutive_failures')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  const consecutiveFailures = success 
    ? 0 
    : (existingStatus?.consecutive_failures || 0) + 1;

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

// Helper function to log audit events
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

// Helper function to sync a single user's vehicles
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

  // Get user's vehicles
  const { data: vehicles, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('id, tesla_vehicle_id, display_name, vin')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (vehiclesError || !vehicles || vehicles.length === 0) {
    console.log(`[tesla-sync-all] No vehicles for user ${userId}`);
    return { synced: 0, failed: 0, offline: 0, errors: [] };
  }

  for (const vehicle of vehicles) {
    const vehicleName = vehicle.display_name || vehicle.vin;
    
    try {
      console.log(`[tesla-sync-all] Fetching data for vehicle ${vehicle.tesla_vehicle_id} (${vehicleName})`);
      
      // Fetch vehicle data with retry logic
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
        
        // Update sync status
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
      const today = new Date().toISOString().split('T')[0];

      // Get previous reading to calculate daily km
      const { data: prevReading } = await supabase
        .from('mileage_readings')
        .select('odometer_km')
        .eq('vehicle_id', vehicle.id)
        .order('reading_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const dailyKm = prevReading 
        ? Math.max(0, odometerKm - prevReading.odometer_km)
        : 0;

      // Check if we already have a reading for today
      const { data: existingReading } = await supabase
        .from('mileage_readings')
        .select('id')
        .eq('vehicle_id', vehicle.id)
        .eq('reading_date', today)
        .maybeSingle();

      let dbError = null;

      if (existingReading) {
        // Update existing reading
        const { error: updateError } = await supabase
          .from('mileage_readings')
          .update({
            odometer_km: odometerKm,
            daily_km: dailyKm,
          })
          .eq('id', existingReading.id);
        dbError = updateError;
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
        dbError = insertError;
      }

      if (dbError) {
        failed++;
        errors.push(`${vehicleName}: Database error`);
        await updateSyncStatus(supabase, vehicle.id, userId, false, false, 'Database error');
      } else {
        synced++;
        await updateSyncStatus(supabase, vehicle.id, userId, true, false);
        
        // Log successful sync
        await logAuditEvent(supabase, userId, 'MILEAGE_SYNC', 'vehicle', vehicle.id, {
          odometer_km: odometerKm,
          daily_km: dailyKm,
          reading_date: today
        });
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

// Helper function to refresh token if needed
async function getValidAccessToken(
  supabase: any,
  userId: string,
  encryptedAccessToken: string | null,
  encryptedRefreshToken: string | null,
  expiresAt: Date | null,
  clientId: string,
  clientSecret: string
): Promise<{ token: string | null; refreshed: boolean }> {
  // Decrypt access token
  let accessToken: string | null = null;
  if (encryptedAccessToken) {
    try {
      accessToken = await decryptToken(encryptedAccessToken);
    } catch (error) {
      console.error(`[tesla-sync-all] Failed to decrypt access token for user ${userId}:`, error);
      return { token: null, refreshed: false };
    }
  }
  
  // Check if token is expired or will expire in the next 5 minutes
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  if (expiresAt && expiresAt.getTime() - bufferTime < Date.now()) {
    console.log(`[tesla-sync-all] Token expired for user ${userId}, refreshing...`);
    
    if (!encryptedRefreshToken) {
      console.error(`[tesla-sync-all] No refresh token for user ${userId}`);
      return { token: null, refreshed: false };
    }

    // Decrypt refresh token
    let refreshToken: string;
    try {
      refreshToken = await decryptToken(encryptedRefreshToken);
    } catch (error) {
      console.error(`[tesla-sync-all] Failed to decrypt refresh token for user ${userId}:`, error);
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
      accessToken = tokens.access_token;

      // Encrypt and store refreshed tokens
      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
      const newEncryptedAccessToken = await encryptToken(tokens.access_token);
      const newEncryptedRefreshToken = await encryptToken(tokens.refresh_token);
      
      await supabase.rpc('store_encrypted_tesla_tokens', {
        p_user_id: userId,
        p_encrypted_access_token: newEncryptedAccessToken,
        p_encrypted_refresh_token: newEncryptedRefreshToken,
        p_expires_at: newExpiresAt
      });

      // Log token refresh
      await logAuditEvent(supabase, userId, 'TOKEN_REFRESH', 'tesla_auth', null, {
        success: true
      });

      console.log(`[tesla-sync-all] Token refreshed for user ${userId}`);
      return { token: accessToken, refreshed: true };
      
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
    // Verify CRON_SECRET for authorization
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

    // Get all users with encrypted Tesla tokens
    const { data: encryptedTokens, error: tokensError } = await supabase
      .from('encrypted_tesla_tokens')
      .select('user_id, encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .not('encrypted_access_token', 'is', null);

    if (tokensError) {
      console.error('[tesla-sync-all] Failed to get encrypted tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'database_error', message: 'Failed to fetch encrypted tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!encryptedTokens || encryptedTokens.length === 0) {
      console.log('[tesla-sync-all] No users with Tesla tokens found');
      
      // Log sync attempt even if no users
      await logAuditEvent(supabase, null as any, 'SYNC_ALL', 'system', null, {
        trigger: 'cron',
        users_found: 0
      });
      
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

    console.log(`[tesla-sync-all] Found ${encryptedTokens.length} users with Tesla tokens`);

    let totalSynced = 0;
    let totalFailed = 0;
    let totalOffline = 0;
    let usersProcessed = 0;
    let usersFailed = 0;
    let tokensRefreshed = 0;
    const allErrors: string[] = [];

    // Process each user
    for (const tokenRecord of encryptedTokens) {
      try {
        console.log(`[tesla-sync-all] Processing user ${tokenRecord.user_id}`);
        
        const expiresAt = tokenRecord.token_expires_at ? new Date(tokenRecord.token_expires_at) : null;
        
        // Get valid access token (decrypt and refresh if needed)
        const { token: accessToken, refreshed } = await getValidAccessToken(
          supabase, 
          tokenRecord.user_id,
          tokenRecord.encrypted_access_token,
          tokenRecord.encrypted_refresh_token,
          expiresAt,
          clientId, 
          clientSecret
        );
        
        if (refreshed) tokensRefreshed++;
        
        if (!accessToken) {
          console.error(`[tesla-sync-all] Could not get valid token for user ${tokenRecord.user_id}`);
          usersFailed++;
          allErrors.push(`User ${tokenRecord.user_id.substring(0, 8)}...: Token invalid`);
          
          // Log failed token
          await logAuditEvent(supabase, tokenRecord.user_id, 'SYNC_FAILED', 'user', tokenRecord.user_id, {
            reason: 'invalid_token'
          });
          continue;
        }

        // Sync user's vehicles
        const { synced, failed, offline, errors } = await syncUserVehicles(
          supabase,
          tokenRecord.user_id,
          accessToken,
          teslaApiBaseUrl
        );

        totalSynced += synced;
        totalFailed += failed;
        totalOffline += offline;
        usersProcessed++;
        
        if (errors.length > 0) {
          allErrors.push(...errors.map(e => `User ${tokenRecord.user_id.substring(0, 8)}...: ${e}`));
        }

        console.log(`[tesla-sync-all] User ${tokenRecord.user_id}: ${synced} synced, ${failed} failed, ${offline} offline`);

        // Small delay between users to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-sync-all] Error processing user ${tokenRecord.user_id}:`, errorMsg);
        usersFailed++;
        allErrors.push(`User ${tokenRecord.user_id.substring(0, 8)}...: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    
    // Log overall sync completion
    await logAuditEvent(supabase, null as any, 'SYNC_ALL_COMPLETE', 'system', null, {
      total_users: profiles.length,
      users_processed: usersProcessed,
      users_failed: usersFailed,
      vehicles_synced: totalSynced,
      vehicles_failed: totalFailed,
      vehicles_offline: totalOffline,
      tokens_refreshed: tokensRefreshed,
      duration_ms: duration
    });
    
    console.log(`[tesla-sync-all] Completed in ${duration}ms: ${usersProcessed}/${profiles.length} users, ${totalSynced} synced, ${totalFailed} failed, ${totalOffline} offline`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Synced ${totalSynced} vehicles for ${usersProcessed} users`,
        stats: {
          total_users: profiles.length,
          users_processed: usersProcessed,
          users_failed: usersFailed,
          vehicles_synced: totalSynced,
          vehicles_failed: totalFailed,
          vehicles_offline: totalOffline,
          tokens_refreshed: tokensRefreshed,
        },
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
