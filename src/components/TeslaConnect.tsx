import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Car } from 'lucide-react';

interface TeslaConnectProps {
  onConnected?: () => void;
}

export default function TeslaConnect({ onConnected }: TeslaConnectProps) {
  const [loading, setLoading] = useState(false);
  const connectingRef = React.useRef(false);

  const handleConnect = async () => {
    // Prevent duplicate clicks
    if (connectingRef.current || loading) {
      console.log('[TeslaConnect] Already connecting, ignoring duplicate click');
      return;
    }

    try {
      connectingRef.current = true;
      setLoading(true);
      console.log('[TeslaConnect] Starting Tesla OAuth flow');

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Je moet ingelogd zijn om Tesla te verbinden');
        return;
      }

      // Call tesla-start to initiate OAuth
      const { data, error } = await supabase.functions.invoke('tesla-start', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('[TeslaConnect] Error:', error);
        toast.error('Kon Tesla verbinding niet starten');
        return;
      }

      if (!data?.authUrl) {
        console.error('[TeslaConnect] No auth URL received');
        toast.error('Geen autorisatie URL ontvangen');
        return;
      }

      console.log('[TeslaConnect] Redirecting to Tesla authorization');
      // Redirect to Tesla OAuth
      window.location.href = data.authUrl;

    } catch (error) {
      console.error('[TeslaConnect] Exception:', error);
      toast.error('Er ging iets mis bij het verbinden met Tesla');
      connectingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={loading}
      size="lg"
      className="w-full"
    >
      <Car className="h-5 w-5 mr-2" />
      {loading ? 'Verbinden...' : 'Verbind je Tesla'}
    </Button>
  );
}
