import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { redirectUri } = await req.json();
    
    const clientId = Deno.env.get('TESLA_CLIENT_ID');
    
    if (!clientId) {
      throw new Error('Tesla Client ID not configured');
    }

    // Use the provided redirect URI (should be https://kmtrack.nl/oauth2callback for production)
    const finalRedirectUri = redirectUri || 'https://kmtrack.nl/oauth2callback';

    const state = crypto.randomUUID();
    
    const authUrl = new URL('https://auth.tesla.com/oauth2/v3/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', finalRedirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds');
    authUrl.searchParams.append('state', state);

    console.log('Generated Tesla OAuth URL');
    console.log('- Client ID:', clientId.substring(0, 10) + '...');
    console.log('- Redirect URI:', finalRedirectUri);

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state: state
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating Tesla OAuth URL:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
