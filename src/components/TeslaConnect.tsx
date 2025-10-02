import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const TeslaConnect: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    checkConnection();
  }, [user]);

  const checkConnection = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('profiles')
        .select('tesla_token_expires_at')
        .eq('user_id', user.id)
        .single();
      
      if (data?.tesla_token_expires_at) {
        const expiresAt = new Date(data.tesla_token_expires_at);
        setIsConnected(expiresAt > new Date());
        setLastSync(data.tesla_token_expires_at);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      
      if (isConnected) {
        // Trigger re-sync
        await supabase.functions.invoke('tesla-vehicles');
        await supabase.functions.invoke('tesla-mileage');
        toast.success('Gegevens gesynchroniseerd!');
        setIsLoading(false);
        return;
      }
      
      const { data, error } = await supabase.functions.invoke('tesla-start');

      if (error) throw error;

      if (!data?.authUrl || !data?.state) {
        throw new Error('Invalid response from server');
      }

      // Store state for verification
      sessionStorage.setItem('tesla_oauth_state', data.state);
      
      // Redirect to Tesla OAuth with PKCE
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
      className={isConnected ? "bg-success hover:bg-success/90" : "bg-accent hover:bg-accent/90"}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {isConnected ? 'Synchroniseren...' : 'Verbinden...'}
        </>
      ) : isConnected ? (
        <>
          <CheckCircle className="h-4 w-4 mr-2" />
          Synchroniseer Tesla
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
