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
import { Calendar, MapPin, Car, MoreHorizontal, Download, Edit, Trash2, Loader2, Clock, Navigation } from 'lucide-react';
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
    const header = [
      'Datum',
      'Tijdstip',
      'Voertuig',
      'VIN',
      'Kilometers',
      'Start km-stand',
      'Eind km-stand',
      'Start locatie',
      'Eind locatie',
      'Latitude',
      'Longitude',
      'Google Maps link',
      'Doel',
      'Beschrijving',
      'Synthetisch (gap-fill)'
    ].join(',');

    const csvContent = [
      header,
      ...trips.map(trip => {
        const purpose = trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé';
        const escapeCsv = (v: unknown) => String(v ?? '').split('"').join('""');

        const description = escapeCsv(trip.metadata?.description || '');
        const time = trip.metadata?.synced_at ? formatTime(trip.metadata.synced_at) : '';
        const lat = trip.metadata?.latitude ?? '';
        const lng = trip.metadata?.longitude ?? '';

        const endOdo = Number(trip.metadata?.end_odometer_km ?? trip.odometer_km);
        const startOdo = Number(
          trip.metadata?.start_odometer_km ??
            (trip.metadata?.end_odometer_km ? trip.odometer_km : trip.odometer_km - (trip.daily_km || 0))
        );
        const km = Math.max(0, endOdo - startOdo);

        const startLocation = escapeCsv(trip.metadata?.start_location || '');
        const endLocation = escapeCsv(trip.location_name || trip.metadata?.location_name || trip.metadata?.end_location || '');
        const mapsLink = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '';
        const isSynthetic = trip.metadata?.synthetic ? 'ja' : 'nee';

        return [
          trip.reading_date,
          `"${time || ''}"`,
          `"${escapeCsv(trip.vehicle?.display_name || 'Onbekend')}"`,
          `""`,
          km,
          startOdo,
          endOdo,
          `"${startLocation}"`,
          `"${endLocation}"`,
          lat,
          lng,
          `"${mapsLink}"`,
          `"${purpose}"`,
          `"${description}"`,
          `"${isSynthetic}"`
        ].join(',');
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

  const formatTime = (isoString: string | null) => {
    if (!isoString) return null;
    try {
      return new Date(isoString).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return null;
    }
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
                      {/* Header row with date, time and badge */}
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 font-medium">
                          <Calendar className="h-4 w-4 text-primary" />
                          {formatDate(trip.reading_date)}
                          {trip.metadata?.synced_at && (
                            <span className="text-muted-foreground font-normal">
                              om {formatTime(trip.metadata.synced_at)}
                            </span>
                          )}
                        </div>
                        <Badge 
                          variant={trip.metadata?.purpose === 'business' ? 'default' : 'secondary'}
                        >
                          {trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé'}
                        </Badge>
                      </div>
                      
                      {/* Main stats grid */}
                      {(() => {
                        // Consistent calculation using metadata first, then fallback
                        const endOdo = Number(trip.metadata?.end_odometer_km ?? trip.odometer_km);
                        const startOdo = Number(trip.metadata?.start_odometer_km ?? (endOdo - (trip.daily_km || 0)));
                        const km = Math.max(0, endOdo - startOdo);
                        
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">{trip.vehicle?.display_name || 'Onbekend'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-lg font-semibold ${km > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                                {km} km
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              Start: {startOdo.toLocaleString()} km
                            </div>
                            <div className="text-muted-foreground">
                              Eind: <span className="font-medium">{endOdo.toLocaleString()} km</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Location info - Van → Naar display */}
                      {(trip.location_name || trip.metadata?.location_name || trip.metadata?.latitude) && (
                        <div className="flex flex-col gap-1 p-2 bg-muted/50 rounded-md text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-foreground">
                              {trip.location_name || trip.metadata?.location_name || 'Locatie beschikbaar'}
                            </span>
                            {trip.metadata?.latitude && trip.metadata?.longitude && (
                              <a 
                                href={`https://www.google.com/maps?q=${trip.metadata.latitude},${trip.metadata.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-auto flex items-center gap-1 text-primary hover:underline font-medium"
                              >
                                <Navigation className="h-4 w-4" />
                                Kaart
                              </a>
                            )}
                          </div>
                          {trip.metadata?.start_location && trip.metadata?.start_location !== trip.location_name && (
                            <div className="text-xs text-muted-foreground ml-6">
                              Van: {trip.metadata.start_location}
                            </div>
                          )}
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