import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Calendar,
  MapPin,
  Car,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

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
  };
}

interface DayGroup {
  dateKey: string;
  label: string;
  trips: Trip[];
  totalKm: number;
  businessKm: number;
  personalKm: number;
}

interface DailyTripsViewProps {
  refreshTrigger: number;
  filters: {
    vehicleId: string;
    purpose: string;
    startDate: string;
    endDate: string;
  };
}

export const DailyTripsView: React.FC<DailyTripsViewProps> = ({ refreshTrigger, filters }) => {
  const { user } = useAuth();
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const fetchTrips = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('trips')
        .select(`
          id, vehicle_id, started_at, ended_at,
          start_location, end_location,
          start_odometer_km, end_odometer_km,
          purpose, description, is_manual,
          vehicle:vehicles(display_name)
        `)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

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

      const { data, error } = await query.limit(500);
      if (error) throw error;

      // Group by date
      const groups: Record<string, Trip[]> = {};
      for (const trip of (data || []) as Trip[]) {
        const dateKey = new Date(trip.started_at).toLocaleDateString('nl-NL', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(trip);
      }

      const sorted = Object.entries(groups)
        .map(([dateKey, trips]) => {
          const totalKm = trips.reduce((s, t) =>
            s + (t.end_odometer_km ? t.end_odometer_km - t.start_odometer_km : 0), 0);
          const businessKm = trips.reduce((s, t) =>
            t.purpose === 'business' ? s + (t.end_odometer_km ? t.end_odometer_km - t.start_odometer_km : 0) : s, 0);
          const personalKm = trips.reduce((s, t) =>
            t.purpose === 'personal' ? s + (t.end_odometer_km ? t.end_odometer_km - t.start_odometer_km : 0) : s, 0);
          // Format a nice label from the first trip's date
          const label = new Date(trips[0].started_at).toLocaleDateString('nl-NL', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          });
          return { dateKey, label, trips, totalKm, businessKm, personalKm };
        })
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

      setDayGroups(sorted);
      // Auto-open the most recent day
      if (sorted.length > 0) {
        setOpenDays(new Set([sorted[0].dateKey]));
      }
    } catch (err) {
      console.error('Error fetching trips:', err);
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrips(); }, [user, refreshTrigger, filters]);

  const toggleDay = (dateKey: string) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Car className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>Geen ritten gevonden</p>
        <p className="text-sm mt-1">Pas je filters aan of voeg een rit toe</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dayGroups.map((day) => (
        <Card key={day.dateKey} className="overflow-hidden">
          <Collapsible open={openDays.has(day.dateKey)} onOpenChange={() => toggleDay(day.dateKey)}>
            <CollapsibleTrigger asChild>
              <button className="w-full text-left">
                <div className="flex items-center justify-between p-4 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {openDays.has(day.dateKey)
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <Calendar className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-semibold capitalize">{day.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {day.trips.length} rit{day.trips.length !== 1 ? 'ten' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {day.businessKm > 0 && (
                      <Badge variant="default" className="text-xs">
                        Zakelijk: {day.businessKm} km
                      </Badge>
                    )}
                    {day.personalKm > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Privé: {day.personalKm} km
                      </Badge>
                    )}
                    <span className="font-bold text-primary">{day.totalKm} km</span>
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t divide-y">
                {day.trips.map((trip) => {
                  const distance = trip.end_odometer_km
                    ? trip.end_odometer_km - trip.start_odometer_km
                    : 0;
                  const endTime = trip.ended_at ? fmt(trip.ended_at) : null;

                  return (
                    <div key={trip.id} className="p-4 pl-12 hover:bg-accent/20 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          {/* Time row */}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{fmt(trip.started_at)}</span>
                            {endTime && (
                              <>
                                <ArrowRight className="h-3 w-3" />
                                <span>{endTime}</span>
                              </>
                            )}
                            <Badge
                              variant={trip.purpose === 'business' ? 'default' : 'secondary'}
                              className="text-xs ml-1"
                            >
                              {trip.purpose === 'business' ? 'Zakelijk' : 'Privé'}
                            </Badge>
                          </div>

                          {/* Route */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                              <span>{trip.start_location || 'Onbekend vertrekpunt'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                              <span>{trip.end_location || 'Onbekende bestemming'}</span>
                            </div>
                          </div>

                          {/* Vehicle & description */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Car className="h-3.5 w-3.5" />
                              {trip.vehicle?.display_name || 'Onbekend'}
                            </span>
                            {trip.description && (
                              <span className="italic">"{trip.description}"</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold text-primary">{distance} km</div>
                          <div className="text-xs text-muted-foreground">
                            {trip.start_odometer_km.toLocaleString()} → {trip.end_odometer_km?.toLocaleString() || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}
    </div>
  );
};
