import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function isVehicleOfflineError(status: number, errorText: string): boolean {
  const offlineIndicators = [
    'vehicle unavailable', 'vehicle is offline', 'timeout', 'asleep', 'could not wake', '408', '504'
  ];
  if (status === 408 || status === 504) return true;
  const lowerError = errorText.toLowerCase();
  return offlineIndicators.some(indicator => lowerError.includes(indicator.toLowerCase()));
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
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      
      return { success: false, isOffline, error: `API error (${response.status}): ${errorText.substring(0, 100)}` };
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

  for (const vehicle of vehicles) {
    const vehicleName = vehicle.display_name || vehicle.vin;
    
    try {
      console.log(`[tesla-sync-all] Fetching data for vehicle ${vehicle.tesla_vehicle_id} (${vehicleName})`);
      
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
      const today = new Date().toISOString().split('T')[0];

      const { data: prevReading } = await supabase
        .from('mileage_readings')
        .select('odometer_km')
        .eq('vehicle_id', vehicle.id)
        .order('reading_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const dailyKm = prevReading ? Math.max(0, odometerKm - prevReading.odometer_km) : 0;

      const { error: upsertError } = await supabase
        .from('mileage_readings')
        .upsert({
          vehicle_id: vehicle.id,
          user_id: userId,
          reading_date: today,
          odometer_km: odometerKm,
          daily_km: dailyKm,
        }, {
          onConflict: 'vehicle_id,reading_date',
        });

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

// Get tokens with fallback to profiles table for migration
async function getTokensWithFallback(
  supabase: any,
  userId: string
): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null }> {
  
  // First, try encrypted tokens
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
      console.error(`[tesla-sync-all] Failed to decrypt tokens for user ${userId}:`, error);
    }
  }

  // Fallback: check profiles table
  console.log(`[tesla-sync-all] No encrypted tokens for user ${userId}, checking profiles...`);
  const { data: profile } = await supabase
    .from('profiles')
    .select('tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.tesla_access_token) {
    console.log(`[tesla-sync-all] Found plaintext tokens for user ${userId}, migrating...`);
    
    try {
      const encryptedAccessToken = await encryptToken(profile.tesla_access_token);
      const encryptedRefreshToken = profile.tesla_refresh_token 
        ? await encryptToken(profile.tesla_refresh_token)
        : null;
      
      await supabase.rpc('store_encrypted_tesla_tokens', {
        p_user_id: userId,
        p_encrypted_access_token: encryptedAccessToken,
        p_encrypted_refresh_token: encryptedRefreshToken,
        p_expires_at: profile.tesla_token_expires_at
      });

      console.log(`[tesla-sync-all] Token migration successful for user ${userId}`);
    } catch (error) {
      console.error(`[tesla-sync-all] Token migration failed for user ${userId}:`, error);
    }

    return { 
      accessToken: profile.tesla_access_token, 
      refreshToken: profile.tesla_refresh_token,
      expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null
    };
  }

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
      const newEncryptedAccessToken = await encryptToken(tokens.access_token);
      const newEncryptedRefreshToken = await encryptToken(tokens.refresh_token);
      
      await supabase.rpc('store_encrypted_tesla_tokens', {
        p_user_id: userId,
        p_encrypted_access_token: newEncryptedAccessToken,
        p_encrypted_refresh_token: newEncryptedRefreshToken,
        p_expires_at: newExpiresAt
      });

      await logAuditEvent(supabase, userId, 'TOKEN_REFRESH', 'tesla_auth', null, { success: true });

      console.log(`[tesla-sync-all] Token refreshed for user ${userId}`);
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

    // Get users from both encrypted_tesla_tokens AND profiles tables
    const { data: encryptedTokenUsers } = await supabase
      .from('encrypted_tesla_tokens')
      .select('user_id')
      .not('encrypted_access_token', 'is', null);

    const { data: profileUsers } = await supabase
      .from('profiles')
      .select('user_id')
      .not('tesla_access_token', 'is', null);

    // Combine and deduplicate user IDs
    const userIds = new Set<string>();
    encryptedTokenUsers?.forEach(u => userIds.add(u.user_id));
    profileUsers?.forEach(u => userIds.add(u.user_id));

    if (userIds.size === 0) {
      console.log('[tesla-sync-all] No users with Tesla tokens found');
      return new Response(
        JSON.stringify({ success: true, message: 'No users to sync', total_users: 0, synced_vehicles: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[tesla-sync-all] Found ${userIds.size} users with Tesla tokens`);

    let totalSynced = 0;
    let totalFailed = 0;
    let totalOffline = 0;
    let usersProcessed = 0;
    let usersFailed = 0;
    let tokensRefreshed = 0;
    const allErrors: string[] = [];

    for (const userId of userIds) {
      try {
        console.log(`[tesla-sync-all] Processing user ${userId}`);
        
        // Get tokens with fallback migration
        const { accessToken, refreshToken, expiresAt } = await getTokensWithFallback(supabase, userId);
        
        if (!accessToken) {
          console.log(`[tesla-sync-all] No valid tokens for user ${userId}`);
          usersFailed++;
          continue;
        }

        const { token: validToken, refreshed } = await getValidAccessToken(
          supabase, userId, accessToken, refreshToken, expiresAt, clientId, clientSecret
        );
        
        if (refreshed) tokensRefreshed++;
        
        if (!validToken) {
          console.error(`[tesla-sync-all] Could not get valid token for user ${userId}`);
          usersFailed++;
          allErrors.push(`User ${userId.substring(0, 8)}...: Token invalid`);
          await logAuditEvent(supabase, userId, 'SYNC_FAILED', 'user', userId, { reason: 'invalid_token' });
          continue;
        }

        const result = await syncUserVehicles(supabase, userId, validToken, teslaApiBaseUrl);
        
        totalSynced += result.synced;
        totalFailed += result.failed;
        totalOffline += result.offline;
        allErrors.push(...result.errors);
        usersProcessed++;
        
        if (result.synced > 0) {
          await logAuditEvent(supabase, userId, 'SYNC_SUCCESS', 'user', userId, {
            synced: result.synced, failed: result.failed, offline: result.offline
          });
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[tesla-sync-all] Error processing user ${userId}:`, errorMsg);
        usersFailed++;
        allErrors.push(`User ${userId.substring(0, 8)}...: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[tesla-sync-all] Completed in ${duration}ms: ${usersProcessed} users, ${totalSynced} vehicles synced`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync completed: ${totalSynced} vehicles synced for ${usersProcessed} users`,
        total_users: userIds.size,
        users_processed: usersProcessed,
        users_failed: usersFailed,
        tokens_refreshed: tokensRefreshed,
        synced_vehicles: totalSynced,
        failed_vehicles: totalFailed,
        offline_vehicles: totalOffline,
        duration_ms: duration,
        errors: allErrors.length > 0 ? allErrors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-sync-all] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'server_error', message: 'Sync failed', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
