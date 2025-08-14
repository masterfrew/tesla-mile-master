import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Car, MoreHorizontal, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Trip {
  id: string;
  reading_date: string;
  daily_km: number;
  odometer_km: number;
  location_name: string | null;
  metadata: {
    purpose?: 'business' | 'personal';
    description?: string;
  } | null;
  vehicle?: {
    display_name: string;
    model: string;
    year: number;
  };
}

interface TripsListProps {
  refreshTrigger: number;
}

export const TripsList: React.FC<TripsListProps> = ({ refreshTrigger }) => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('mileage_readings')
        .select(`
          id,
          reading_date,
          daily_km,
          odometer_km,
          location_name,
          metadata,
          vehicle:vehicles(display_name, model, year)
        `)
        .eq('user_id', user.id)
        .order('reading_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      'Datum,Voertuig,Kilometers,Kilometerstand,Locatie,Doel,Beschrijving',
      ...trips.map(trip => {
        const purpose = trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé';
        const description = trip.metadata?.description || '';
        return `${trip.reading_date},${trip.vehicle?.display_name || 'Onbekend'},${trip.daily_km},${trip.odometer_km},"${trip.location_name || ''}","${purpose}","${description}"`;
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `km-track-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Export gedownload!');
  };

  useEffect(() => {
    fetchTrips();
  }, [user, refreshTrigger]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recente ritten
          </CardTitle>
          {trips.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exporteren
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {trips.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nog geen ritten geregistreerd</p>
            <p className="text-sm">Voeg je eerste rit toe om te beginnen</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {formatDate(trip.reading_date)}
                    </div>
                    <Badge 
                      variant={trip.metadata?.purpose === 'business' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      {trip.vehicle?.display_name || 'Onbekend voertuig'}
                    </div>
                    <div>
                      <span className="font-medium">{trip.daily_km} km</span> gereden
                    </div>
                    <div>
                      Stand: <span className="font-medium">{trip.odometer_km.toLocaleString()} km</span>
                    </div>
                  </div>

                  {trip.location_name && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {trip.location_name}
                    </div>
                  )}

                  {trip.metadata?.description && (
                    <p className="mt-2 text-sm text-muted-foreground italic">
                      {trip.metadata.description}
                    </p>
                  )}
                </div>

                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};