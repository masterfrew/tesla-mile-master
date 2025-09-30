import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const TeslaCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('Verwerken...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const storedState = sessionStorage.getItem('tesla_oauth_state');

        if (!code) {
          throw new Error('Geen autorisatiecode ontvangen');
        }

        if (state !== storedState) {
          throw new Error('Ongeldige OAuth state');
        }

        if (!user) {
          throw new Error('Niet ingelogd');
        }

        setStatus('Tesla-account verbinden...');

        // Exchange code for tokens
        const { data: authData, error: authError } = await supabase.functions.invoke('tesla-auth', {
          body: { code },
        });

        if (authError) throw authError;
        if (authData?.error) throw new Error(authData.error);

        setStatus('Voertuigen ophalen...');

        // Fetch vehicles
        const { data: vehiclesData, error: vehiclesError } = await supabase.functions.invoke('tesla-vehicles');

        if (vehiclesError) {
          console.error('Failed to fetch vehicles:', vehiclesError);
        }

        setStatus('Kilometerstand synchroniseren...');

        // Fetch mileage data
        const { data: mileageData, error: mileageError } = await supabase.functions.invoke('tesla-mileage');

        if (mileageError) {
          console.error('Failed to sync mileage:', mileageError);
        }

        // Clean up
        sessionStorage.removeItem('tesla_oauth_state');

        toast({
          title: "Succesvol verbonden!",
          description: `${vehiclesData?.vehicles_count || 0} voertuig(en) geïmporteerd.`,
        });

        // Redirect to dashboard
        navigate('/dashboard');

      } catch (error) {
        console.error('Tesla callback error:', error);
        toast({
          title: "Fout bij verbinden",
          description: error instanceof Error ? error.message : 'Onbekende fout',
          variant: "destructive",
        });
        navigate('/dashboard');
      }
    };

    if (user) {
      handleCallback();
    }
  }, [searchParams, navigate, user]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
        <h2 className="text-xl font-semibold mb-2">Tesla Verbinden</h2>
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
};

export default TeslaCallback;
