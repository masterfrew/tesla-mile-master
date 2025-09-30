import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TeslaConnect: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      const redirectUri = `${window.location.origin}/tesla/callback`;
      
      const { data, error } = await supabase.functions.invoke('tesla-oauth-url', {
        body: { redirectUri }
      });

      if (error) throw error;

      if (!data?.authUrl || !data?.state) {
        throw new Error('Invalid response from server');
      }

      // Store state for verification
      sessionStorage.setItem('tesla_oauth_state', data.state);
      
      // Redirect to Tesla OAuth
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error initiating Tesla connection:', error);
      toast.error('Fout bij verbinden met Tesla. Probeer het later opnieuw.');
      setIsLoading(false);
    }
  };

  return (
    <Button 
      size="lg" 
      onClick={handleConnect} 
      className="bg-accent hover:bg-accent/90"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Verbinden...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 mr-2" />
          Verbind met Tesla
        </>
      )}
    </Button>
  );
};

export default TeslaConnect;
