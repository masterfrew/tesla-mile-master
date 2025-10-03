import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

const TeslaCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('Verwerken...');

  const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
    if (error instanceof FunctionsHttpError) {
      try {
        const errorBody = await error.context.json();
        if (errorBody?.error && typeof errorBody.error === 'string') {
          return errorBody.error;
        }
      } catch (parseError) {
        console.error('Failed to parse FunctionsHttpError context:', parseError);
      }
      return error.message || 'Onbekende fout';
    }

    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      if (error.context && typeof error.context === 'object' && 'error' in error.context) {
        const contextError = (error.context as { error?: unknown }).error;
        if (typeof contextError === 'string') {
          return contextError;
        }
      }
      return error.message || 'Onbekende fout';
    }

    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }

    return 'Onbekende fout';
  };

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log complete URL and all parameters
        console.log('[TeslaCallback] Full URL:', window.location.href);
        console.log('[TeslaCallback] All URL params:', Object.fromEntries(searchParams.entries()));
        
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const storedState = sessionStorage.getItem('tesla_oauth_state');

        console.log('[TeslaCallback] Code:', code ? code.substring(0, 20) + '...' : code);
        console.log('[TeslaCallback] State:', state);
        console.log('[TeslaCallback] State type:', typeof state);
        console.log('[TeslaCallback] Stored state:', storedState);

        if (!code) {
          throw new Error('Geen autorisatiecode ontvangen');
        }

        if (!state) {
          throw new Error('Geen state parameter ontvangen');
        }

        if (!user) {
          throw new Error('Niet ingelogd');
        }

        setStatus('Tesla-account verbinden...');

        // Exchange code for tokens - backend validates state against database
        const { data: authData, error: authError } = await supabase.functions.invoke('tesla-auth', {
          body: { code, state },
        });

        if (authError) {
          throw new Error(await getFunctionErrorMessage(authError));
        }
        if (authData?.error) throw new Error(authData.error);

        setStatus('Voertuigen ophalen...');

        // Fetch vehicles
        const { data: vehiclesData, error: vehiclesError } = await supabase.functions.invoke('tesla-vehicles');

        if (vehiclesError) {
          console.error('Failed to fetch vehicles:', vehiclesError);
          throw new Error(await getFunctionErrorMessage(vehiclesError));
        }

        setStatus('Kilometerstand synchroniseren...');

        // Fetch mileage data
        const { data: mileageData, error: mileageError } = await supabase.functions.invoke('tesla-mileage');

        if (mileageError) {
          console.error('Failed to sync mileage:', mileageError);
          throw new Error(await getFunctionErrorMessage(mileageError));
        }

        // Clean up
        sessionStorage.removeItem('tesla_oauth_state');

        toast({
          title: "Succesvol verbonden!",
          description: `${vehiclesData?.vehicles_count || 0} voertuig(en) geïmporteerd.`,
        });

        // Redirect to dashboard
        navigate('/');

      } catch (error) {
        console.error('Tesla callback error:', error);
        const errorMessage = await getFunctionErrorMessage(error);
        toast({
          title: "Fout bij verbinden",
          description: errorMessage,
          variant: "destructive",
        });
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
