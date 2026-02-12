import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TripsList } from '@/components/TripsList';
import { supabase } from '@/integrations/supabase/client';
import { Car, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

const Trips = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Basic filters
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedPurpose, setSelectedPurpose] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchVehicles = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, display_name, model, year')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('display_name');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Je moet ingelogd zijn om te synchroniseren');
        return;
      }

      const response = await supabase.functions.invoke('tesla-mileage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      if (result.synced > 0) {
        toast.success(`${result.synced} voertuig(en) gesynchroniseerd`);
        setRefreshTrigger(prev => prev + 1);
      } else {
        toast.info('Geen nieuwe data om te synchroniseren');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error(`Synchronisatie mislukt: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => { fetchVehicles(); }, [user]);

  if (vehicles.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto text-center py-16">
          <Car className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
          <h1 className="text-2xl font-bold mb-4">Geen voertuigen gevonden</h1>
          <p className="text-muted-foreground mb-6">Verbind eerst je Tesla account.</p>
          <Button onClick={() => window.history.back()}>Terug naar dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Ritregistratie</h1>
              <p className="text-muted-foreground">Alle ritten op een rij</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={handleSync} disabled={isSyncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sync...' : 'Sync Tesla'}
            </Button>
          </div>
        </div>

        {/* Simplified Filter UI could go here, passed to TripsList */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             {/* Add simple selects/date pickers here if needed, or rely on TripsList internal logic */}
        </div>
            
        <TripsList
          refreshTrigger={refreshTrigger}
          vehicles={vehicles}
          filters={{
            vehicleId: selectedVehicle,
            purpose: selectedPurpose,
            startDate,
            endDate,
          }}
        />
      </div>
    </div>
  );
};

export default Trips;
