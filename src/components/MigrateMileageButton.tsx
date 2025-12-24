import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface MigrateMileageButtonProps {
  onMigrationComplete: () => void;
}

export const MigrateMileageButton: React.FC<MigrateMileageButtonProps> = ({ onMigrationComplete }) => {
  const { user } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStats, setMigrationStats] = useState<{ total: number; migrated: number } | null>(null);

  const handleMigration = async () => {
    if (!user) return;
    
    setIsMigrating(true);
    setMigrationStats(null);
    
    try {
      // Fetch all mileage_readings with daily_km > 0 that haven't been migrated
      const { data: readings, error: fetchError } = await supabase
        .from('mileage_readings')
        .select(`
          id,
          vehicle_id,
          reading_date,
          daily_km,
          odometer_km,
          location_name,
          metadata,
          vehicle:vehicles(display_name)
        `)
        .eq('user_id', user.id)
        .gt('daily_km', 0)
        .order('reading_date', { ascending: true });

      if (fetchError) throw fetchError;

      if (!readings || readings.length === 0) {
        toast.info('Geen dagelijkse data om te migreren');
        setIsMigrating(false);
        return;
      }

      // Check which readings are already migrated (by checking trips with same date)
      const { data: existingTrips, error: tripsError } = await supabase
        .from('trips')
        .select('started_at, vehicle_id')
        .eq('user_id', user.id);

      if (tripsError) throw tripsError;

      // Create a set of existing trip dates per vehicle
      const existingTripKeys = new Set(
        (existingTrips || []).map(t => `${t.vehicle_id}-${t.started_at.split('T')[0]}`)
      );

      let migratedCount = 0;
      const tripsToInsert = [];

      for (const reading of readings) {
        const tripKey = `${reading.vehicle_id}-${reading.reading_date}`;
        
        // Skip if already migrated
        if (existingTripKeys.has(tripKey)) continue;

        const metadata = reading.metadata as Record<string, any> || {};
        const startOdometer = metadata.start_odometer_km || (reading.odometer_km - reading.daily_km);
        const endOdometer = metadata.end_odometer_km || reading.odometer_km;
        const startLocation = metadata.start_location || null;
        const endLocation = metadata.end_location || reading.location_name || null;
        const latitude = metadata.latitude || metadata.end_lat || null;
        const longitude = metadata.longitude || metadata.end_lon || null;

        // Create a trip entry for this day
        tripsToInsert.push({
          user_id: user.id,
          vehicle_id: reading.vehicle_id,
          started_at: `${reading.reading_date}T08:00:00`, // Default start time
          ended_at: `${reading.reading_date}T18:00:00`, // Default end time
          start_location: startLocation,
          end_location: endLocation,
          start_odometer_km: startOdometer,
          end_odometer_km: endOdometer,
          start_lat: null,
          start_lon: null,
          end_lat: latitude,
          end_lon: longitude,
          purpose: 'business', // Default to business
          description: `Gemigreerd van dagelijkse data (${reading.daily_km} km)`,
          is_manual: false,
          metadata: {
            migrated_from: 'mileage_readings',
            original_reading_id: reading.id,
            migration_date: new Date().toISOString(),
          },
        });

        migratedCount++;
      }

      if (tripsToInsert.length === 0) {
        toast.info('Alle data is al gemigreerd');
        setIsMigrating(false);
        return;
      }

      // Insert trips in batches of 50
      const batchSize = 50;
      for (let i = 0; i < tripsToInsert.length; i += batchSize) {
        const batch = tripsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('trips')
          .insert(batch);

        if (insertError) {
          console.error('Migration batch error:', insertError);
          throw insertError;
        }
      }

      setMigrationStats({ total: readings.length, migrated: migratedCount });
      toast.success(`${migratedCount} ritten gemigreerd naar nieuwe rittenlijst!`);
      onMigrationComplete();

    } catch (error) {
      console.error('Migration error:', error);
      toast.error('Fout bij migreren van data');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isMigrating}>
          {isMigrating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Migreren...
            </>
          ) : (
            <>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Migreer oude data
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Oude data migreren naar ritten?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Dit zet je dagelijkse kilometerdata om naar individuele ritten. Elke dag met
              gereden kilometers wordt één rit.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Let op:</strong> Locaties zijn mogelijk niet beschikbaar vanuit de oude data.
              Je kunt deze later handmatig invullen per rit.
            </p>
            {migrationStats && (
              <p className="text-sm font-medium text-primary">
                Laatste migratie: {migrationStats.migrated} van {migrationStats.total} dagen
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={handleMigration} disabled={isMigrating}>
            {isMigrating ? 'Bezig...' : 'Migreren'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
