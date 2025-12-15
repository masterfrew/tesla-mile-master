import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { encryptToken, decryptToken } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get and migrate tokens
async function getTokensWithFallback(
  supabase: any,
  userId: string
): Promise<{ accessToken: string | null; refreshToken: string | null; expiresAt: Date | null; migrated: boolean }> {
  
  // First, try to get encrypted tokens
  const { data: encryptedTokenData, error: encryptedError } = await supabase
    .from('encrypted_tesla_tokens')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (encryptedTokenData?.encrypted_access_token) {
    console.log('[tesla-vehicles] Found encrypted tokens');
    try {
      const accessToken = await decryptToken(encryptedTokenData.encrypted_access_token);
      const refreshToken = encryptedTokenData.encrypted_refresh_token 
        ? await decryptToken(encryptedTokenData.encrypted_refresh_token)
        : null;
      const expiresAt = encryptedTokenData.token_expires_at 
        ? new Date(encryptedTokenData.token_expires_at) 
        : null;
      return { accessToken, refreshToken, expiresAt, migrated: false };
    } catch (error) {
      console.error('[tesla-vehicles] Failed to decrypt tokens:', error);
    }
  }

  // Fallback: check profiles table for plaintext tokens
  console.log('[tesla-vehicles] No encrypted tokens found, checking profiles table for migration...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tesla_access_token, tesla_refresh_token, tesla_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError || !profile?.tesla_access_token) {
    console.log('[tesla-vehicles] No tokens found in profiles table either');
    return { accessToken: null, refreshToken: null, expiresAt: null, migrated: false };
  }

  console.log('[tesla-vehicles] Found plaintext tokens in profiles, migrating to encrypted storage...');
  
  // Encrypt and migrate tokens
  try {
    const encryptedAccessToken = await encryptToken(profile.tesla_access_token);
    const encryptedRefreshToken = profile.tesla_refresh_token 
      ? await encryptToken(profile.tesla_refresh_token)
      : null;
    
    // Store encrypted tokens
    await supabase.rpc('store_encrypted_tesla_tokens', {
      p_user_id: userId,
      p_encrypted_access_token: encryptedAccessToken,
      p_encrypted_refresh_token: encryptedRefreshToken,
      p_expires_at: profile.tesla_token_expires_at
    });

    console.log('[tesla-vehicles] Token migration successful');
    
    return { 
      accessToken: profile.tesla_access_token, 
      refreshToken: profile.tesla_refresh_token,
      expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null,
      migrated: true 
    };
  } catch (error) {
    console.error('[tesla-vehicles] Token migration failed:', error);
    return { 
      accessToken: profile.tesla_access_token, 
      refreshToken: profile.tesla_refresh_token,
      expiresAt: profile.tesla_token_expires_at ? new Date(profile.tesla_token_expires_at) : null,
      migrated: false 
    };
  }
}

// Helper function to refresh tokens
async function refreshAccessToken(
  supabase: any,
  userId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string | null; error?: string }> {
  console.log('[tesla-vehicles] Refreshing expired token...');
  
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
    console.error('[tesla-vehicles] Token refresh failed:', errorText);
    return { accessToken: null, error: 'Token refresh failed' };
  }

  const tokens = await refreshResponse.json();
  
  // Encrypt and store refreshed tokens
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  const encryptedAccessToken = await encryptToken(tokens.access_token);
  const encryptedRefreshToken = await encryptToken(tokens.refresh_token);
  
  await supabase.rpc('store_encrypted_tesla_tokens', {
    p_user_id: userId,
    p_encrypted_access_token: encryptedAccessToken,
    p_encrypted_refresh_token: encryptedRefreshToken,
    p_expires_at: newExpiresAt
  });

  console.log('[tesla-vehicles] Token refreshed and stored successfully');
  return { accessToken: tokens.access_token };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-vehicles] Fetching Tesla vehicles...');

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: 'missing_authorization',
          message: 'Geen autorisatie header'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    const clientSecret = Deno.env.get('TESLA_CLIENT_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-vehicles] Failed to get user:', userError);
      return new Response(
        JSON.stringify({ 
          error: 'not_authenticated',
          message: 'Gebruiker niet geauthenticeerd'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-vehicles] Getting tokens for user:', user.id);

    // Get tokens with fallback migration
    let { accessToken, refreshToken, expiresAt, migrated } = await getTokensWithFallback(supabase, user.id);

    if (!accessToken) {
      console.error('[tesla-vehicles] No Tesla tokens found');
      return new Response(
        JSON.stringify({ 
          error: 'no_token',
          message: 'Geen Tesla toegangstoken gevonden. Verbind je Tesla account opnieuw.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (migrated) {
      console.log('[tesla-vehicles] Tokens were migrated from plaintext to encrypted storage');
    }

    // Check if token is expired and refresh if needed
    if (expiresAt && expiresAt < new Date()) {
      if (!refreshToken) {
        return new Response(
          JSON.stringify({ 
            error: 'token_expired',
            message: 'Token verlopen en geen refresh token beschikbaar. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ 
            error: 'configuration_error',
            message: 'Tesla credentials niet geconfigureerd'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refreshResult = await refreshAccessToken(supabase, user.id, refreshToken, clientId, clientSecret);
      if (!refreshResult.accessToken) {
        return new Response(
          JSON.stringify({ 
            error: 'refresh_failed',
            message: 'Token vernieuwen mislukt. Verbind je Tesla account opnieuw.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      accessToken = refreshResult.accessToken;
    }

    console.log('[tesla-vehicles] Fetching vehicles from Tesla API...');

    const teslaApiBaseUrl = Deno.env.get('TESLA_FLEET_API_BASE_URL')
      || 'https://fleet-api.prd.eu.vn.cloud.tesla.com';

    // Fetch vehicles from Tesla API
    const vehiclesResponse = await fetch(`${teslaApiBaseUrl}/api/1/vehicles`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vehiclesResponse.ok) {
      const errorText = await vehiclesResponse.text();
      console.error('[tesla-vehicles] Tesla API error:', vehiclesResponse.status, errorText);
      
      return new Response(
        JSON.stringify({ 
          error: 'api_error',
          message: `Tesla API fout (${vehiclesResponse.status})`,
          details: errorText
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vehiclesData = await vehiclesResponse.json();
    const vehicles = vehiclesData.response || [];
    
    console.log(`[tesla-vehicles] Found ${vehicles.length} vehicles`);

    if (vehicles.length === 0) {
      console.log('[tesla-vehicles] No vehicles found for this account');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Geen voertuigen gevonden',
          vehicles_count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store vehicles in database
    let storedCount = 0;
    const errors = [];

    for (const vehicle of vehicles) {
      try {
        if (!vehicle.id || !vehicle.vin) {
          console.error('[tesla-vehicles] Invalid vehicle data:', vehicle);
          errors.push(`Vehicle ${vehicle.display_name || 'unknown'}: missing required data`);
          continue;
        }

        const { error: upsertError } = await supabase
          .from('vehicles')
          .upsert({
            user_id: user.id,
            tesla_vehicle_id: vehicle.id,
            vin: vehicle.vin,
            display_name: vehicle.display_name || null,
            model: vehicle.vehicle_config?.car_type || null,
            color: vehicle.vehicle_config?.exterior_color || null,
            year: vehicle.vehicle_config?.year || null,
            is_active: true,
          }, {
            onConflict: 'user_id,tesla_vehicle_id',
          });

        if (upsertError) {
          console.error('[tesla-vehicles] Failed to upsert vehicle:', vehicle.vin, upsertError);
          errors.push(`${vehicle.vin}: ${upsertError.message}`);
        } else {
          console.log('[tesla-vehicles] Stored vehicle:', vehicle.vin);
          storedCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[tesla-vehicles] Error processing vehicle:', errorMsg);
        errors.push(`Processing error: ${errorMsg}`);
      }
    }

    console.log(`[tesla-vehicles] SUCCESS: Stored ${storedCount}/${vehicles.length} vehicles`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${storedCount} voertuigen opgeslagen`,
        vehicles_count: storedCount,
        total_found: vehicles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tesla-vehicles] FATAL_ERROR:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: 'server_error',
        message: 'Er ging iets mis bij het ophalen van voertuigen',
        details: errorMessage
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
