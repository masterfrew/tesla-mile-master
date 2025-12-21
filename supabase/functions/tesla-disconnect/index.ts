import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[tesla-disconnect] Starting Tesla disconnect process');
    
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[tesla-disconnect] No authorization header');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[tesla-disconnect] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('[tesla-disconnect] User verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[tesla-disconnect] User authenticated:', user.id);

    // IMPORTANT: We do NOT delete mileage_readings - this is the user's historical data!
    // We only disconnect the Tesla account, not erase their trip history.

    // Mark vehicles as inactive (instead of deleting them)
    // This preserves the link to mileage_readings and allows reactivation on reconnect
    console.log('[tesla-disconnect] Marking vehicles as inactive...');
    const { error: vehiclesError } = await supabaseAdmin
      .from('vehicles')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (vehiclesError) {
      console.error('[tesla-disconnect] Error marking vehicles inactive:', vehiclesError);
    }

    // Clear Tesla tokens from profile
    console.log('[tesla-disconnect] Clearing Tesla tokens...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        tesla_access_token: null,
        tesla_refresh_token: null,
        tesla_token_expires_at: null,
      })
      .eq('user_id', user.id);

    if (profileError) {
      console.error('[tesla-disconnect] Error clearing tokens:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to disconnect Tesla account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete any pending PKCE states
    console.log('[tesla-disconnect] Cleaning up PKCE states...');
    const { error: pkceError } = await supabaseAdmin
      .from('oauth_pkce_state')
      .delete()
      .eq('user_id', user.id);

    if (pkceError) {
      console.error('[tesla-disconnect] Error cleaning PKCE states:', pkceError);
    }

    console.log('[tesla-disconnect] Tesla account successfully disconnected');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Tesla account successfully disconnected'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[tesla-disconnect] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});