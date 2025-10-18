import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TripForm } from '@/components/TripForm';
import { TripsList } from '@/components/TripsList';
import { TripsFilter } from '@/components/TripsFilter';
import { TripsStats } from '@/components/TripsStats';
import { supabase } from '@/integrations/supabase/client';
import { Car, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

const Trips = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showTripForm, setShowTripForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
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

  useEffect(() => {
    fetchVehicles();
  }, [user]);

  const handleTripAdded = () => {
    setRefreshTrigger(prev => prev + 1);
    setShowTripForm(false);
  };

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
              Voeg eerst een voertuig toe om ritten te kunnen registreren.
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
              <h1 className="text-3xl font-bold">Ritten beheer</h1>
              <p className="text-muted-foreground">
                Voeg nieuwe ritten toe en bekijk je kilometerhistorie
              </p>
            </div>
          </div>
          
          {!showTripForm && (
            <Button onClick={() => setShowTripForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe rit
            </Button>
          )}
        </div>

        {showTripForm ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Nieuwe rit toevoegen</h2>
              <Button variant="outline" onClick={() => setShowTripForm(false)}>
                Annuleren
              </Button>
            </div>
            <TripForm vehicles={vehicles} onTripAdded={handleTripAdded} />
          </div>
        ) : (
          <>
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
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Trips;