import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TripForm } from '@/components/TripForm';
import { TripsList } from '@/components/TripsList';
import { supabase } from '@/integrations/supabase/client';
import { Car, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ritten beheer</h1>
            <p className="text-muted-foreground">
              Voeg nieuwe ritten toe en bekijk je kilometerhistorie
            </p>
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
          <TripsList refreshTrigger={refreshTrigger} />
        )}
      </div>
    </div>
  );
};

export default Trips;