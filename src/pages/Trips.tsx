import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TripsList } from '@/components/TripsList';
import { TripsFilter } from '@/components/TripsFilter';
import { TripsStats } from '@/components/TripsStats';
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
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  
  // Filter state
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedPurpose, setSelectedPurpose] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Stats state
  const [stats, setStats] = useState({
    totalBusinessKm: 0,
    totalPersonalKm: 0,
    totalKm: 0,
  });

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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      
      if (result.synced > 0) {
        toast.success(`${result.synced} voertuig(en) gesynchroniseerd`);
        setRefreshTrigger(prev => prev + 1);
        setLastSyncTime(new Date().toLocaleTimeString('nl-NL'));
      } else if (result.errors?.length > 0) {
        toast.warning(`Sync voltooid met fouten: ${result.errors.join(', ')}`);
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

  useEffect(() => {
    fetchVehicles();
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('mileage_readings')
        .select('daily_km, metadata')
        .eq('user_id', user.id);

      if (selectedVehicle && selectedVehicle !== 'all') {
        query = query.eq('vehicle_id', selectedVehicle);
      }

      if (startDate) {
        query = query.gte('reading_date', startDate);
      }

      if (endDate) {
        query = query.lte('reading_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      let businessKm = 0;
      let personalKm = 0;

      data?.forEach((trip) => {
        const km = trip.daily_km || 0;
        const metadata = trip.metadata as any;
        if (metadata?.purpose === 'business') {
          businessKm += km;
        } else if (metadata?.purpose === 'personal') {
          personalKm += km;
        }
      });

      setStats({
        totalBusinessKm: businessKm,
        totalPersonalKm: personalKm,
        totalKm: businessKm + personalKm,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleResetFilters = () => {
    setSelectedVehicle('all');
    setSelectedPurpose('all');
    setStartDate('');
    setEndDate('');
  };

  const activeFiltersCount = [
    selectedVehicle !== 'all',
    selectedPurpose !== 'all',
    startDate,
    endDate,
  ].filter(Boolean).length;

  useEffect(() => {
    fetchStats();
  }, [user, selectedVehicle, selectedPurpose, startDate, endDate, refreshTrigger]);

  if (vehicles.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-16">
            <Car className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h1 className="text-2xl font-bold mb-4">Geen voertuigen gevonden</h1>
            <p className="text-muted-foreground mb-6">
              Verbind eerst je Tesla account om ritten te kunnen synchroniseren.
            </p>
            <Button onClick={() => window.history.back()}>
              Terug naar dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Kilometerbeheer</h1>
              <p className="text-muted-foreground">
                Bekijk en classificeer je Tesla ritten
                {lastSyncTime && (
                  <span className="ml-2 text-xs">• Laatste sync: {lastSyncTime}</span>
                )}
              </p>
            </div>
          </div>
          
          <Button onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synchroniseren...' : 'Sync nu'}
          </Button>
        </div>

        <TripsStats
          totalBusinessKm={stats.totalBusinessKm}
          totalPersonalKm={stats.totalPersonalKm}
          totalKm={stats.totalKm}
        />
        
        <TripsFilter
          vehicles={vehicles}
          selectedVehicle={selectedVehicle}
          selectedPurpose={selectedPurpose}
          startDate={startDate}
          endDate={endDate}
          onVehicleChange={setSelectedVehicle}
          onPurposeChange={setSelectedPurpose}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onReset={handleResetFilters}
          activeFiltersCount={activeFiltersCount}
        />
        
        <TripsList
          refreshTrigger={refreshTrigger}
          vehicles={vehicles}
          filters={{
            vehicleId: selectedVehicle,
            purpose: selectedPurpose,
            startDate,
            endDate,
          }}
          onRefresh={() => setRefreshTrigger(prev => prev + 1)}
        />
      </div>
    </div>
  );
};

export default Trips;
