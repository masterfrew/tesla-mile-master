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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Calendar, Download, Edit, Trash2, Loader2, MoreHorizontal, MapPin } from 'lucide-react';
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
      const { error } = await supabase.from('mileage_readings').delete().eq('id', deletingTripId);
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
    // ... existing export logic ...
    const header = ['Datum', 'Tijd', 'Kenteken', 'Start KM', 'Eind KM', 'Verschil', 'Locatie', 'Type'].join(',');
    const csvContent = [
        header,
        ...trips.map(trip => {
            const date = trip.reading_date;
            const time = trip.metadata?.synced_at ? new Date(trip.metadata.synced_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
            const plate = trip.vehicle?.display_name || 'Unknown';
            const endOdo = Number(trip.metadata?.end_odometer_km ?? trip.odometer_km);
            const startOdo = Number(trip.metadata?.start_odometer_km ?? (endOdo - (trip.daily_km || 0)));
            const diff = Math.max(0, endOdo - startOdo);
            const location = trip.location_name || '';
            const type = trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé';
            
            return [date, time, plate, startOdo, endOdo, diff, `"${location}"`, type].join(',');
        })
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `km-track-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => { fetchTrips(); }, [user, refreshTrigger, filters]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    } catch { return '-'; }
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
                CSV Export
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Tijd</TableHead>
                    <TableHead>Kenteken</TableHead>
                    <TableHead className="text-right">Start KM</TableHead>
                    <TableHead className="text-right">Eind KM</TableHead>
                    <TableHead className="text-right">Verschil</TableHead>
                    <TableHead>Locatie</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        Geen ritten gevonden.
                      </TableCell>
                    </TableRow>
                  ) : (
                    trips.map((trip) => {
                        const endOdo = Number(trip.metadata?.end_odometer_km ?? trip.odometer_km);
                        const startOdo = Number(trip.metadata?.start_odometer_km ?? (endOdo - (trip.daily_km || 0)));
                        const diff = Math.max(0, endOdo - startOdo);
                        const purpose = trip.metadata?.purpose === 'business' ? 'Zakelijk' : 'Privé';

                        return (
                          <TableRow key={trip.id}>
                            <TableCell>{formatDate(trip.reading_date)}</TableCell>
                            <TableCell>{formatTime(trip.metadata?.synced_at)}</TableCell>
                            <TableCell>{trip.vehicle?.display_name || 'Tesla'}</TableCell>
                            <TableCell className="text-right font-mono">{startOdo.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{endOdo.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-bold font-mono">
                                {diff > 0 ? `+${diff}` : '-'}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={trip.location_name || ''}>
                                <div className="flex items-center gap-1">
                                    {trip.location_name && <MapPin className="h-3 w-3 text-muted-foreground" />}
                                    {trip.location_name || '-'}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={purpose === 'Zakelijk' ? 'default' : 'secondary'}>
                                    {purpose}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setEditingTrip(trip)}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Bewerken
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => { setDeletingTripId(trip.id); setShowDeleteDialog(true); }} className="text-destructive">
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Verwijderen
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            
            {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Meer laden'}
                  </Button>
                </div>
            )}
        </CardContent>
      </Card>

      <TripEditDialog
        trip={editingTrip}
        vehicles={vehicles}
        open={!!editingTrip}
        onOpenChange={(open) => !open && setEditingTrip(null)}
        onTripUpdated={() => { setEditingTrip(null); fetchTrips(); }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>Deze actie kan niet ongedaan gemaakt worden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
