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
import { Calendar, MapPin, Car, MoreHorizontal, Download, Edit, Trash2, Loader2, Clock, Navigation, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { EditTripDialog } from './EditTripDialog';

interface Trip {
  id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  start_location: string | null;
  end_location: string | null;
  start_odometer_km: number;
  end_odometer_km: number | null;
  purpose: string;
  description: string | null;
  is_manual: boolean;
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

interface NewTripsListProps {
  refreshTrigger: number;
  vehicles: Vehicle[];
  filters: {
    vehicleId: string;
    purpose: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  };
}

export const NewTripsList: React.FC<NewTripsListProps> = ({ refreshTrigger, vehicles, filters }) => {
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
        .from('trips')
        .select(`
          id,
          vehicle_id,
          started_at,
          ended_at,
          start_location,
          end_location,
          start_odometer_km,
          end_odometer_km,
          purpose,
          description,
          is_manual,
          vehicle:vehicles(display_name, model, year)
        `)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      // Apply filters
      if (filters.vehicleId && filters.vehicleId !== 'all') {
        query = query.eq('vehicle_id', filters.vehicleId);
      }

      if (filters.purpose && filters.purpose !== 'all') {
        query = query.eq('purpose', filters.purpose);
      }

      if (filters.startDate) {
        query = query.gte('started_at', `${filters.startDate}T00:00:00`);
      }

      if (filters.endDate) {
        query = query.lte('started_at', `${filters.endDate}T23:59:59`);
      }

      const startIndex = reset ? 0 : trips.length;
      query = query.range(startIndex, startIndex + ITEMS_PER_PAGE - 1);

      const { data, error } = await query;

      if (error) throw error;

      let filteredData = (data || []) as Trip[];

      // Filter by time (client-side)
      if (filters.startTime || filters.endTime) {
        filteredData = filteredData.filter(trip => {
          const tripTime = new Date(trip.started_at);
          const hours = tripTime.getHours();
          const minutes = tripTime.getMinutes();
          const tripTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          
          if (filters.startTime && tripTimeStr < filters.startTime) return false;
          if (filters.endTime && tripTimeStr > filters.endTime) return false;
          return true;
        });
      }

      if (reset) {
        setTrips(filteredData);
      } else {
        setTrips(prev => [...prev, ...filteredData]);
      }

      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
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
        .from('trips')
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
    // Comprehensive export headers for accounting
    const header = [
      'Datum',
      'Vertrektijd',
      'Aankomsttijd',
      'Voertuig',
      'Kenteken',
      'Start locatie',
      'Eind locatie',
      'Start km-stand',
      'Eind km-stand',
      'Afstand (km)',
      'Type rit',
      'Zakelijk (km)',
      'Privé (km)',
      'Beschrijving',
      'Handmatig ingevoerd',
      'Google Maps route'
    ].join(',');

    // Calculate totals
    let totalBusiness = 0;
    let totalPersonal = 0;

    const csvRows = trips.map(trip => {
      const escapeCsv = (v: unknown) => String(v ?? '').replace(/"/g, '""');
      const startDate = new Date(trip.started_at);
      const endDate = trip.ended_at ? new Date(trip.ended_at) : null;
      const distance = trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0;
      
      const businessKm = trip.purpose === 'business' ? distance : 0;
      const personalKm = trip.purpose === 'personal' ? distance : 0;
      totalBusiness += businessKm;
      totalPersonal += personalKm;

      // Generate Google Maps URL if locations available
      const startLoc = trip.start_location ? encodeURIComponent(trip.start_location) : '';
      const endLoc = trip.end_location ? encodeURIComponent(trip.end_location) : '';
      const mapsUrl = startLoc && endLoc 
        ? `https://www.google.com/maps/dir/${startLoc}/${endLoc}`
        : '';

      return [
        startDate.toLocaleDateString('nl-NL'),
        startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        endDate ? endDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '',
        `"${escapeCsv(trip.vehicle?.display_name || 'Onbekend')}"`,
        '', // Kenteken placeholder - could be added from vehicle data
        `"${escapeCsv(trip.start_location || 'Niet opgegeven')}"`,
        `"${escapeCsv(trip.end_location || 'Niet opgegeven')}"`,
        trip.start_odometer_km,
        trip.end_odometer_km || '',
        distance,
        trip.purpose === 'business' ? 'Zakelijk' : 'Privé',
        businessKm,
        personalKm,
        `"${escapeCsv(trip.description || '')}"`,
        trip.is_manual ? 'Ja' : 'Nee',
        `"${escapeCsv(mapsUrl)}"`
      ].join(',');
    });

    // Add summary row
    const summaryRow = [
      'TOTAAL',
      '', '', '', '', '', '', '', '',
      totalBusiness + totalPersonal,
      '',
      totalBusiness,
      totalPersonal,
      '', '', ''
    ].join(',');

    // Add disclaimer if any locations are missing
    const missingLocations = trips.some(t => !t.start_location || !t.end_location);
    const disclaimerRows = missingLocations ? [
      '',
      '"OPMERKING: Sommige locaties zijn niet beschikbaar. Dit kan komen doordat:"',
      '"- De Tesla in slaapstand was tijdens sync"',
      '"- Locatie-data niet beschikbaar was via Tesla API"',
      '"- De rit handmatig is ingevoerd zonder locatie"',
      '"U kunt locaties handmatig invullen via de app."'
    ] : [];

    const csvContent = [
      header,
      ...csvRows,
      '',
      summaryRow,
      ...disclaimerRows
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ritten-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Export gedownload!');
  };

  useEffect(() => {
    fetchTrips();
  }, [user, refreshTrigger, filters]);

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    };
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
              <p className="text-sm">Voeg een nieuwe rit toe of pas je filters aan</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {trips.map((trip) => {
                  const start = formatDateTime(trip.started_at);
                  const end = trip.ended_at ? formatDateTime(trip.ended_at) : null;
                  const distance = trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0;

                  return (
                    <div
                      key={trip.id}
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2 font-medium">
                            <Calendar className="h-4 w-4 text-primary" />
                            {start.date}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {start.time}
                            {end && (
                              <>
                                <ArrowRight className="h-3 w-3" />
                                {end.time}
                              </>
                            )}
                          </div>
                          <Badge variant={trip.purpose === 'business' ? 'default' : 'secondary'}>
                            {trip.purpose === 'business' ? 'Zakelijk' : 'Privé'}
                          </Badge>
                          {trip.is_manual && (
                            <Badge variant="outline" className="text-xs">
                              Handmatig
                            </Badge>
                          )}
                        </div>

                        {/* Route */}
                        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <span>{trip.start_location || 'Onbekend'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <MapPin className="h-4 w-4 text-red-500 flex-shrink-0" />
                              <span>{trip.end_location || 'Onbekend'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-primary">
                              {distance} km
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {trip.start_odometer_km.toLocaleString()} → {trip.end_odometer_km?.toLocaleString() || '—'} km
                            </div>
                          </div>
                        </div>

                        {/* Vehicle & Description */}
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Car className="h-4 w-4" />
                            {trip.vehicle?.display_name || 'Onbekend'}
                          </div>
                          {trip.description && (
                            <span className="text-muted-foreground italic">
                              "{trip.description}"
                            </span>
                          )}
                        </div>
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
                  );
                })}
              </div>

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
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

      <EditTripDialog
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
