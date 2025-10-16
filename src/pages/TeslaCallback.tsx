import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const TeslaCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('Verwerken...');
  const hasProcessed = useRef(false);


  useEffect(() => {
    const handleCallback = async () => {
      if (hasProcessed.current) {
        console.log('[TeslaCallback] Already processed, skipping');
        return;
      }
      hasProcessed.current = true;
      console.log('[TeslaCallback] Processing callback (hasProcessed set to true)');

      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');

        console.log('[TeslaCallback] Processing callback with code and state');

        if (!code || !state) {
          toast.error('Ongeldige callback parameters');
          navigate('/');
          return;
        }

        if (!user) {
          toast.error('Je moet ingelogd zijn');
          navigate('/auth');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error('Geen actieve sessie');
          navigate('/auth');
          return;
        }

        setStatus('Tokens uitwisselen...');

        // Exchange code for tokens
        const { error: authError } = await supabase.functions.invoke('tesla-auth', {
          body: { code, state },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (authError) {
          console.error('[TeslaCallback] Auth error:', authError);
          toast.error('Kon tokens niet uitwisselen');
          navigate('/');
          return;
        }

        setStatus('Account registreren...');

        // Register for Europe region
        const { error: registerError } = await supabase.functions.invoke('tesla-register', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (registerError) {
          console.error('[TeslaCallback] Register warning (continuing):', registerError);
        }

        setStatus('Voertuigen ophalen...');

        // Fetch vehicles
        const { error: vehiclesError } = await supabase.functions.invoke('tesla-vehicles', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (vehiclesError) {
          console.error('[TeslaCallback] Vehicles error:', vehiclesError);
          toast.error('Kon voertuigen niet ophalen');
          navigate('/');
          return;
        }

        setStatus('Kilometerstand synchroniseren...');

        // Sync mileage
        const { error: mileageError } = await supabase.functions.invoke('tesla-mileage', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (mileageError) {
          console.error('[TeslaCallback] Mileage error:', mileageError);
          toast.warning('Voertuigen toegevoegd, maar kilometerstand kon niet worden gesynchroniseerd');
        } else {
          toast.success('Tesla succesvol verbonden en data gesynchroniseerd!');
        }

        navigate('/');

      } catch (error) {
        console.error('[TeslaCallback] Error:', error);
        toast.error('Er ging iets mis bij het verwerken van de Tesla verbinding');
        navigate('/');
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
