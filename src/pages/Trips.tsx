import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NewTripsList } from '@/components/NewTripsList';
import { NewTripsFilter } from '@/components/NewTripsFilter';
import { TripsStats } from '@/components/TripsStats';
import { ManualTripForm } from '@/components/ManualTripForm';
import { MigrateMileageButton } from '@/components/MigrateMileageButton';
import { supabase } from '@/integrations/supabase/client';
import { Car, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TripsList } from '@/components/TripsList';
import { TripsFilter } from '@/components/TripsFilter';
import { TripsMap } from '@/components/TripsMap';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface TripLocation {
  id: string;
  reading_date: string;
  daily_km: number;
  latitude: number;
  longitude: number;
  vehicle_name: string;
  location_name?: string;
}

const Trips = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [tripLocations, setTripLocations] = useState<TripLocation[]>([]);
  const [activeTab, setActiveTab] = useState('trips');
  
  // Filter state for new trips
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedPurpose, setSelectedPurpose] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  
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
      // Fetch stats from new trips table
      let query = supabase
        .from('trips')
        .select('start_odometer_km, end_odometer_km, purpose')
        .eq('user_id', user.id);

      if (selectedVehicle && selectedVehicle !== 'all') {
        query = query.eq('vehicle_id', selectedVehicle);
      }

      if (startDate) {
        query = query.gte('started_at', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('started_at', `${endDate}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      let businessKm = 0;
      let personalKm = 0;

      data?.forEach((trip) => {
        const km = trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0;
        if (trip.purpose === 'business') {
          businessKm += km;
        } else if (trip.purpose === 'personal') {
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

  const fetchTripLocations = async () => {
    if (!user) return;

    try {
      // Fetch from trips table for locations
      let query = supabase
        .from('trips')
        .select(`
          id,
          started_at,
          start_odometer_km,
          end_odometer_km,
          start_lat,
          start_lon,
          end_lat,
          end_lon,
          end_location,
          vehicle:vehicles(display_name)
        `)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(50);

      if (selectedVehicle && selectedVehicle !== 'all') {
        query = query.eq('vehicle_id', selectedVehicle);
      }

      if (startDate) {
        query = query.gte('started_at', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('started_at', `${endDate}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const locations: TripLocation[] = (data || [])
        .filter((trip: any) => trip.end_lat && trip.end_lon)
        .map((trip: any) => ({
          id: trip.id,
          reading_date: trip.started_at.split('T')[0],
          daily_km: trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0,
          latitude: trip.end_lat,
          longitude: trip.end_lon,
          vehicle_name: trip.vehicle?.display_name || 'Onbekend',
          location_name: trip.end_location,
        }));

      setTripLocations(locations);
    } catch (error) {
      console.error('Error fetching trip locations:', error);
    }
  };

  const handleResetFilters = () => {
    setSelectedVehicle('all');
    setSelectedPurpose('all');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
  };

  const activeFiltersCount = [
    selectedVehicle !== 'all',
    selectedPurpose !== 'all',
    startDate,
    endDate,
    startTime,
    endTime,
  ].filter(Boolean).length;

  useEffect(() => {
    fetchStats();
    fetchTripLocations();
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Ritregistratie</h1>
              <p className="text-muted-foreground">
                Beheer je zakelijke en privé ritten
                {lastSyncTime && (
                  <span className="ml-2 text-xs">• Laatste sync: {lastSyncTime}</span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <MigrateMileageButton onMigrationComplete={() => setRefreshTrigger(prev => prev + 1)} />
            <ManualTripForm 
              vehicles={vehicles} 
              onTripAdded={() => setRefreshTrigger(prev => prev + 1)} 
            />
            <Button onClick={handleSync} disabled={isSyncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchroniseren...' : 'Sync Tesla'}
            </Button>
          </div>
        </div>

        <TripsStats
          totalBusinessKm={stats.totalBusinessKm}
          totalPersonalKm={stats.totalPersonalKm}
          totalKm={stats.totalKm}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="trips">Ritten</TabsTrigger>
            <TabsTrigger value="legacy">Dagelijkse data (oud)</TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="space-y-6 mt-4">
            <NewTripsFilter
              vehicles={vehicles}
              selectedVehicle={selectedVehicle}
              selectedPurpose={selectedPurpose}
              startDate={startDate}
              endDate={endDate}
              startTime={startTime}
              endTime={endTime}
              onVehicleChange={setSelectedVehicle}
              onPurposeChange={setSelectedPurpose}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              onReset={handleResetFilters}
              activeFiltersCount={activeFiltersCount}
            />
            
            <NewTripsList
              refreshTrigger={refreshTrigger}
              vehicles={vehicles}
              filters={{
                vehicleId: selectedVehicle,
                purpose: selectedPurpose,
                startDate,
                endDate,
                startTime,
                endTime,
              }}
            />
          </TabsContent>

          <TabsContent value="legacy" className="space-y-6 mt-4">
            <TripsMap locations={tripLocations} />
            
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
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trips;
