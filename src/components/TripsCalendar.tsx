import React, { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MapPin, Car, Clock, ArrowRight, Loader2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { DayContentProps } from 'react-day-picker';

interface Trip {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_location: string | null;
  end_location: string | null;
  start_odometer_km: number;
  end_odometer_km: number | null;
  purpose: string;
  description: string | null;
  vehicle?: { display_name: string };
}

interface DayData {
  totalKm: number;
  trips: Trip[];
}

interface TripsCalendarProps {
  refreshTrigger: number;
  filters: {
    vehicleId: string;
  };
}

export const TripsCalendar: React.FC<TripsCalendarProps> = ({ refreshTrigger, filters }) => {
  const { user } = useAuth();
  const [tripsByDay, setTripsByDay] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [month, setMonth] = useState<Date>(new Date());

  const toDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const fetchTrips = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
      const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      let query = supabase
        .from('trips')
        .select(`
          id, started_at, ended_at,
          start_location, end_location,
          start_odometer_km, end_odometer_km,
          purpose, description,
          vehicle:vehicles(display_name)
        `)
        .eq('user_id', user.id)
        .gte('started_at', firstDay.toISOString())
        .lte('started_at', lastDay.toISOString())
        .order('started_at', { ascending: true });

      if (filters.vehicleId && filters.vehicleId !== 'all') {
        query = query.eq('vehicle_id', filters.vehicleId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const grouped: Record<string, DayData> = {};
      for (const trip of (data || []) as Trip[]) {
        const key = toDateKey(new Date(trip.started_at));
        if (!grouped[key]) grouped[key] = { totalKm: 0, trips: [] };
        const km = trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0;
        grouped[key].totalKm += km;
        grouped[key].trips.push(trip);
      }
      setTripsByDay(grouped);
    } catch (err) {
      console.error('Error fetching trips:', err);
      toast.error('Fout bij ophalen van rittenkalender');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrips(); }, [user, refreshTrigger, filters, month]);

  const handleDayClick = (day: Date | undefined) => {
    if (!day) return;
    const key = toDateKey(day);
    if (tripsByDay[key]) {
      setSelectedDate(day);
      setSheetOpen(true);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  const selectedKey = selectedDate ? toDateKey(selectedDate) : null;
  const selectedDayData = selectedKey ? tripsByDay[selectedKey] : null;

  // Modifiers for react-day-picker
  const tripDays = Object.keys(tripsByDay).map(k => new Date(k + 'T12:00:00'));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Rittenkalender
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              <div>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDayClick}
                  month={month}
                  onMonthChange={setMonth}
                  modifiers={{ hasTrips: tripDays }}
                  modifiersClassNames={{
                    hasTrips: 'font-bold text-primary ring-2 ring-primary/30 rounded-full',
                  }}
                  components={{
                    DayContent: ({ date }: DayContentProps) => {
                      const key = toDateKey(date);
                      const data = tripsByDay[key];
                      return (
                        <div className="relative flex flex-col items-center">
                          <span>{date.getDate()}</span>
                          {data && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                      );
                    },
                  }}
                  className="rounded-md border"
                />
              </div>

              {/* Legend / summary */}
              <div className="flex-1 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Klik op een dag met een ● om de ritten te bekijken
                </p>
                <div className="space-y-2">
                  {Object.entries(tripsByDay)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 8)
                    .map(([key, data]) => (
                      <button
                        key={key}
                        onClick={() => handleDayClick(new Date(key + 'T12:00:00'))}
                        className="w-full flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors text-sm"
                      >
                        <span className="text-muted-foreground">
                          {new Date(key + 'T12:00:00').toLocaleDateString('nl-NL', {
                            weekday: 'short', day: 'numeric', month: 'short',
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {data.trips.length} rit{data.trips.length !== 1 ? 'ten' : ''}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {data.totalKm} km
                          </Badge>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {selectedDate?.toLocaleDateString('nl-NL', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </SheetTitle>
          </SheetHeader>

          {selectedDayData && (
            <div className="mt-4 space-y-4">
              {/* Summary */}
              <div className="flex gap-3 flex-wrap">
                <Badge variant="outline">
                  {selectedDayData.trips.length} rit{selectedDayData.trips.length !== 1 ? 'ten' : ''}
                </Badge>
                <Badge variant="default">{selectedDayData.totalKm} km totaal</Badge>
              </div>

              {/* Trip list */}
              <div className="space-y-3">
                {selectedDayData.trips.map((trip) => {
                  const distance = trip.end_odometer_km
                    ? trip.end_odometer_km - trip.start_odometer_km
                    : 0;
                  return (
                    <div key={trip.id} className="p-4 border rounded-lg space-y-3">
                      {/* Time + badge */}
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{fmt(trip.started_at)}</span>
                        {trip.ended_at && (
                          <>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span>{fmt(trip.ended_at)}</span>
                          </>
                        )}
                        <Badge
                          variant={trip.purpose === 'business' ? 'default' : 'secondary'}
                          className="text-xs ml-auto"
                        >
                          {trip.purpose === 'business' ? 'Zakelijk' : 'Privé'}
                        </Badge>
                      </div>

                      {/* Route */}
                      <div className="bg-muted/50 rounded-md p-3 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-green-500 flex-shrink-0" />
                          {trip.start_location || 'Onbekend'}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-red-500 flex-shrink-0" />
                          {trip.end_location || 'Onbekend'}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Car className="h-3.5 w-3.5" />
                          {trip.vehicle?.display_name || 'Onbekend'}
                        </span>
                        <span className="font-bold text-primary">{distance} km</span>
                      </div>

                      {trip.description && (
                        <p className="text-xs text-muted-foreground italic">"{trip.description}"</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
