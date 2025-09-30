import React from 'react';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

const TeslaConnect: React.FC = () => {
  const handleConnect = () => {
    const clientId = 'td-0f3e9e86-f759-42b9-a8e5-9f3b8f8b5f7a-c';
    const redirectUri = `${window.location.origin}/tesla/callback`;
    const state = Math.random().toString(36).substring(7);
    
    // Store state for verification
    sessionStorage.setItem('tesla_oauth_state', state);
    
    const authUrl = new URL('https://auth.tesla.com/oauth2/v3/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds');
    authUrl.searchParams.append('state', state);
    
    window.location.href = authUrl.toString();
  };

  return (
    <Button size="lg" onClick={handleConnect} className="bg-accent hover:bg-accent/90">
      <Zap className="h-4 w-4 mr-2" />
      Verbind met Tesla
    </Button>
  );
};

export default TeslaConnect;
