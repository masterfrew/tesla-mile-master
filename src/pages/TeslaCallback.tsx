import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      console.log('[TeslaCallback] Starting callback handler', { hasCode: !!code, hasState: !!state, hasUser: !!user });

      // Validate parameters first
      if (!code || !state) {
        console.error('[TeslaCallback] Missing parameters');
        toast.error('Ongeldige callback parameters');
        navigate('/');
        return;
      }

      if (!user) {
        console.error('[TeslaCallback] No user');
        toast.error('Je moet ingelogd zijn');
        navigate('/auth');
        return;
      }

      // CRITICAL: Check and set sessionStorage ATOMICALLY to prevent race conditions
      const storageKey = `tesla_oauth_${state}`;
      const processingKey = `tesla_oauth_processing_${state}`;
      
      // Check if already completed
      if (sessionStorage.getItem(storageKey) === 'completed') {
        console.log('[TeslaCallback] Already completed this OAuth flow, redirecting');
        navigate('/');
        return;
      }

      // Check if currently processing
      if (sessionStorage.getItem(processingKey) === 'true') {
        console.log('[TeslaCallback] Already processing this OAuth flow, skipping');
        return;
      }

      // Mark as processing IMMEDIATELY
      sessionStorage.setItem(processingKey, 'true');
      console.log('[TeslaCallback] Marked as processing');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('[TeslaCallback] No session');
          sessionStorage.removeItem(storageKey);
          toast.error('Geen actieve sessie');
          navigate('/auth');
          return;
        }

        console.log('[TeslaCallback] Exchanging tokens...');
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
          sessionStorage.removeItem(storageKey);
          toast.error('Kon tokens niet uitwisselen');
          navigate('/');
          return;
        }

        console.log('[TeslaCallback] Tokens exchanged successfully');
        setStatus('Account registreren voor Europa regio...');

        // CRITICAL: Register for Europe region BEFORE fetching vehicles
        // This must succeed or vehicle fetching will fail
        console.log('[TeslaCallback] Starting Tesla account registration for Europe');
        const { data: registerData, error: registerError } = await supabase.functions.invoke('tesla-register', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (registerError) {
          console.error('[TeslaCallback] Registration error:', registerError);
          toast.error('Kon account niet registreren bij Tesla. Probeer opnieuw.');
          sessionStorage.removeItem(storageKey);
          sessionStorage.removeItem(processingKey);
          navigate('/');
          return;
        }

        console.log('[TeslaCallback] Registration successful:', registerData);

        console.log('[TeslaCallback] Fetching vehicles...');
        setStatus('Voertuigen ophalen...');

        // Fetch vehicles
        const { error: vehiclesError } = await supabase.functions.invoke('tesla-vehicles', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (vehiclesError) {
          console.error('[TeslaCallback] Vehicles error:', vehiclesError);
          sessionStorage.removeItem(storageKey);
          toast.error('Kon voertuigen niet ophalen');
          navigate('/');
          return;
        }

        console.log('[TeslaCallback] Syncing mileage...');
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
          console.log('[TeslaCallback] All steps completed successfully');
          toast.success('Tesla succesvol verbonden en data gesynchroniseerd!');
        }

        // Mark as completed
        sessionStorage.setItem(storageKey, 'completed');
        sessionStorage.removeItem(processingKey);
        navigate('/');

      } catch (error) {
        console.error('[TeslaCallback] Exception:', error);
        // Clean up processing flag on error
        const state = searchParams.get('state');
        if (state) {
          sessionStorage.removeItem(`tesla_oauth_processing_${state}`);
        }
        toast.error('Er ging iets mis bij het verwerken van de Tesla verbinding');
        navigate('/');
      }
    };

    // Only run if we have both user and code
    if (user && searchParams.get('code')) {
      handleCallback();
    }
  }, [user, searchParams, navigate]);

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
