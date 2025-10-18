import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MapPin, Car, MoreHorizontal, Download, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TripEditDialog } from './TripEditDialog';

interface Trip {
  id: string;
  vehicle_id: string;
  reading_date: string;
  daily_km: number;
  odometer_km: number;
  location_name: string | null;
  metadata: any;
  vehicle?: {
    display_name: string;
    model: string;
    year: number;
  };
}

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface TripsListProps {
  refreshTrigger: number;
  vehicles: Vehicle[];
  filters: {
    vehicleId: string;
    purpose: string;
    startDate: string;
    endDate: string;
  };
}

export const TripsList: React.FC<TripsListProps> = ({ refreshTrigger, vehicles, filters }) => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const ITEMS_PER_PAGE = 20;

  const fetchTrips = async (reset = true) => {
    if (!user) return;

    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      let query = supabase
        .from('mileage_readings')
        .select(`
          id,
          vehicle_id,
          reading_date,
          daily_km,
          odometer_km,
          location_name,
          metadata,
          vehicle:vehicles(display_name, model, year)
        `)
        .eq('user_id', user.id)
        .order('reading_date', { ascending: false });

      // Apply filters
      if (filters.vehicleId && filters.vehicleId !== 'all') {
        query = query.eq('vehicle_id', filters.vehicleId);
      }

      if (filters.startDate) {
        query = query.gte('reading_date', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('reading_date', filters.endDate);
      }

      const startIndex = reset ? 0 : trips.length;
      query = query.range(startIndex, startIndex + ITEMS_PER_PAGE - 1);

      const { data, error } = await query;

      if (error) throw error;

      let filteredData = data || [];

      // Filter by purpose (client-side since it's in metadata)
      if (filters.purpose && filters.purpose !== 'all') {
        filteredData = filteredData.filter(trip => {
          const metadata = trip.metadata as any;
          return metadata?.purpose === filters.purpose;
        });
      }

      if (reset) {
        setTrips(filteredData);
      } else {
        setTrips(prev => [...prev, ...filteredData]);
      }

      setHasMore(filteredData.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error fetching trips:', error);
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    fetchTrips(false);
  };

  const handleDelete = async () => {
    if (!deletingTripId) return;

    try {
      const { error } = await supabase
        .from('mileage_readings')
        .delete()
        .eq('id', deletingTripId);

      if (error) throw error;

      toast.success('Rit succesvol verwijderd!');
      fetchTrips();
    } catch (error) {
      console.error('Error deleting trip:', error);
      toast.error('Fout bij verwijderen van rit');
    } finally {
      setShowDeleteDialog(false);
      setDeletingTripId(null);
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
  }, [user, refreshTrigger, filters]);

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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Ritten ({trips.length})
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
              <p>Geen ritten gevonden</p>
              <p className="text-sm">Pas je filters aan of voeg een nieuwe rit toe</p>
            </div>
          ) : (
            <>
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

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingTrip(trip)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Bewerken
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeletingTripId(trip.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
              
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Laden...
                      </>
                    ) : (
                      'Laad meer'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <TripEditDialog
        trip={editingTrip}
        vehicles={vehicles}
        open={!!editingTrip}
        onOpenChange={(open) => !open && setEditingTrip(null)}
        onTripUpdated={() => {
          setEditingTrip(null);
          fetchTrips();
        }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan gemaakt worden. De rit wordt permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};