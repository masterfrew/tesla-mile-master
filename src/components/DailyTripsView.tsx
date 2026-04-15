import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Download,
  Edit3,
  Check,
  X,
  Navigation,
  Briefcase,
  User,
  TrendingUp,
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

interface EditState {
  tripId: string;
  field: 'purpose' | 'description';
  value: string;
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '';
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}u ${m}m`;
  return `${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export const DailyTripsView: React.FC<DailyTripsViewProps> = ({ refreshTrigger, filters }) => {
  const { user } = useAuth();
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const totals = dayGroups.reduce(
    (acc, d) => ({
      km: acc.km + d.totalKm,
      biz: acc.biz + d.businessKm,
      priv: acc.priv + d.personalKm,
      trips: acc.trips + d.trips.length,
    }),
    { km: 0, biz: 0, priv: 0, trips: 0 }
  );

  const fetchTrips = useCallback(async () => {
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

      if (filters.vehicleId && filters.vehicleId !== 'all') query = query.eq('vehicle_id', filters.vehicleId);
      if (filters.purpose && filters.purpose !== 'all') query = query.eq('purpose', filters.purpose);
      if (filters.startDate) query = query.gte('started_at', `${filters.startDate}T00:00:00`);
      if (filters.endDate) query = query.lte('started_at', `${filters.endDate}T23:59:59`);

      const { data, error } = await query.limit(500);
      if (error) throw error;

      const groups: Record<string, Trip[]> = {};
      for (const trip of (data || []) as Trip[]) {
        const dateKey = new Date(trip.started_at).toLocaleDateString('nl-NL', {
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(trip);
      }

      const dist = (t: Trip) => t.end_odometer_km ? t.end_odometer_km - t.start_odometer_km : 0;

      const sorted = Object.entries(groups)
        .map(([dateKey, trips]) => ({
          dateKey,
          label: new Date(trips[0].started_at).toLocaleDateString('nl-NL', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          }),
          trips,
          totalKm: trips.reduce((s, t) => s + dist(t), 0),
          businessKm: trips.reduce((s, t) => t.purpose === 'business' ? s + dist(t) : s, 0),
          personalKm: trips.reduce((s, t) => t.purpose === 'personal' ? s + dist(t) : s, 0),
        }))
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

      setDayGroups(sorted);
      if (sorted.length > 0) setOpenDays(new Set([sorted[0].dateKey]));
    } catch (err) {
      console.error('Error fetching trips:', err);
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
    }
  }, [user, refreshTrigger, filters]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const toggleDay = (dateKey: string) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  };

  const startEdit = (tripId: string, field: 'purpose' | 'description', current: string) => {
    setEditState({ tripId, field, value: current });
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    setSavingId(editState.tripId);
    try {
      const { error } = await supabase
        .from('trips')
        .update({ [editState.field]: editState.value, updated_at: new Date().toISOString() })
        .eq('id', editState.tripId);
      if (error) throw error;
      toast.success('Opgeslagen');
      setEditState(null);
      await fetchTrips();
    } catch (err) {
      toast.error('Opslaan mislukt');
    } finally {
      setSavingId(null);
    }
  };

  const exportCSV = () => {
    const allTrips = dayGroups.flatMap(d => d.trips);
    if (allTrips.length === 0) return;

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header = [
      'Datum', 'Dag', 'Starttijd', 'Eindtijd', 'Duur',
      'Voertuig', 'Startlocatie', 'Eindlocatie',
      'Start km-stand', 'Eind km-stand', 'Afstand (km)',
      'Type rit', 'Omschrijving', 'Handmatig', 'Google Maps',
    ].join(',');

    let totalBiz = 0, totalPriv = 0;

    const rows = allTrips.map(trip => {
      const startDate = new Date(trip.started_at);
      const endDate = trip.ended_at ? new Date(trip.ended_at) : null;
      const distance = trip.end_odometer_km ? trip.end_odometer_km - trip.start_odometer_km : 0;
      const durMin = endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : null;
      const durFmt = durMin !== null
        ? (durMin >= 60 ? `${Math.floor(durMin / 60)}u ${durMin % 60}m` : `${durMin}m`)
        : '';
      const isBiz = trip.purpose === 'business';
      if (isBiz) totalBiz += distance; else totalPriv += distance;

      const sl = trip.start_location ? encodeURIComponent(trip.start_location) : '';
      const el = trip.end_location ? encodeURIComponent(trip.end_location) : '';
      const mapsUrl = sl && el ? `https://www.google.com/maps/dir/${sl}/${el}` : '';

      return [
        startDate.toLocaleDateString('nl-NL'),
        startDate.toLocaleDateString('nl-NL', { weekday: 'long' }),
        startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        endDate ? endDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '',
        durFmt,
        esc(trip.vehicle?.display_name || 'Tesla'),
        esc(trip.start_location || 'Onbekend'),
        esc(trip.end_location || 'Onbekend'),
        trip.start_odometer_km,
        trip.end_odometer_km || '',
        distance,
        isBiz ? 'Zakelijk' : 'Privé',
        esc(trip.description || ''),
        trip.is_manual ? 'Ja' : 'Nee',
        esc(mapsUrl),
      ].join(',');
    });

    const summary = ['', 'TOTAAL', '', '', '', '', '', '', '', '', totalBiz + totalPriv, '', esc(`Zakelijk: ${totalBiz} km | Privé: ${totalPriv} km`), '', ''].join(',');
    const csv = '\ufeff' + [header, ...rows, '', summary].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ritregistratie-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Export gedownload');
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
        <p className="font-medium">Geen ritten gevonden</p>
        <p className="text-sm mt-1">Pas je filters aan of synchroniseer je Tesla</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-3">

      {/* Totalen + export */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3" /> Totaal
          </p>
          <p className="text-xl font-bold">{totals.km.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">{totals.trips} ritten</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Briefcase className="h-3 w-3" /> Zakelijk
          </p>
          <p className="text-xl font-bold text-primary">{totals.biz.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">
            {totals.km > 0 ? Math.round(totals.biz / totals.km * 100) : 0}% van totaal
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <User className="h-3 w-3" /> Privé
          </p>
          <p className="text-xl font-bold">{totals.priv.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">
            {totals.km > 0 ? Math.round(totals.priv / totals.km * 100) : 0}% van totaal
          </p>
        </Card>
        <Card className="p-3 flex items-center justify-center">
          <Button variant="outline" size="sm" onClick={exportCSV} className="w-full gap-2">
            <Download className="h-4 w-4" />
            CSV Export
          </Button>
        </Card>
      </div>

      {/* Dag groepen */}
      {dayGroups.map((day) => {
        const dayDate = new Date(day.dateKey.split('-').reverse().join('-'));
        const dayDateFormatted = dayDate.toLocaleDateString('nl-NL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });

        return (
        <Card key={day.dateKey} className="overflow-hidden">
          <Collapsible open={openDays.has(day.dateKey)} onOpenChange={() => toggleDay(day.dateKey)}>

            {/* Day header - full width, tappable */}
            <CollapsibleTrigger asChild>
              <button className="w-full text-left">
                <div className="px-3 py-4 hover:bg-accent/30 transition-colors border-b">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-2xl font-bold">{dayDateFormatted}</p>
                      <p className="text-sm text-muted-foreground capitalize mt-0.5">{day.label}</p>
                    </div>
                    {openDays.has(day.dateKey)
                      ? <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                      : <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />}
                  </div>

                  {/* Total km prominent in header */}
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <span className="text-lg font-bold text-primary">
                      {day.totalKm.toLocaleString('nl-NL')} km
                    </span>
                    {day.businessKm > 0 && (
                      <Badge variant="default" className="text-xs gap-1">
                        <Briefcase className="h-3 w-3" />
                        Zakelijk
                      </Badge>
                    )}
                    {day.personalKm > 0 && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <User className="h-3 w-3" />
                        Privé
                      </Badge>
                    )}
                  </div>

                  {/* Day summary */}
                  <p className="text-xs text-muted-foreground">
                    {day.trips.length} rit{day.trips.length !== 1 ? 'ten' : ''} ·
                    {day.businessKm > 0 && <> {day.businessKm.toLocaleString('nl-NL')} km zakelijk</>}
                    {day.businessKm > 0 && day.personalKm > 0 && ' · '}
                    {day.personalKm > 0 && <> {day.personalKm.toLocaleString('nl-NL')} km privé</>}
                  </p>
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Trips list */}
            <CollapsibleContent>
              <div className="divide-y">
                {day.trips.map((trip) => {
                  const distance = trip.end_odometer_km
                    ? trip.end_odometer_km - trip.start_odometer_km
                    : 0;
                  const duration = trip.ended_at ? formatDuration(trip.started_at, trip.ended_at) : null;
                  const isBiz = trip.purpose === 'business';
                  const isEditingPurpose = editState?.tripId === trip.id && editState.field === 'purpose';
                  const isEditingDesc = editState?.tripId === trip.id && editState.field === 'description';
                  const hasStartLocation = trip.start_location && trip.start_location.trim() !== '';
                  const hasEndLocation = trip.end_location && trip.end_location.trim() !== '';

                  return (
                    <div key={trip.id} className="px-3 py-3 hover:bg-accent/10 transition-colors">
                      <div className="flex gap-3">

                        {/* Route indicator column (left) */}
                        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <div className="w-px flex-1 bg-border min-h-[32px]"></div>
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 space-y-2">

                          {/* Time + duration */}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="font-medium">{formatTime(trip.started_at)}</span>
                            {trip.ended_at && (
                              <>
                                <ArrowRight className="h-3 w-3 shrink-0" />
                                <span className="font-medium">{formatTime(trip.ended_at)}</span>
                                {duration && (
                                  <span className="text-muted-foreground/70">({duration})</span>
                                )}
                              </>
                            )}
                          </div>

                          {/* Locations */}
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-snug break-words">
                              {hasStartLocation ? (
                                trip.start_location
                              ) : (
                                <span className="text-muted-foreground italic text-xs">Locatie onbekend</span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground leading-snug break-words">
                              {hasEndLocation ? (
                                trip.end_location
                              ) : (
                                <span className="italic text-xs">Locatie onbekend</span>
                              )}
                            </p>
                          </div>

                          {/* Purpose + Manual badge + Description */}
                          <div className="flex flex-col gap-2 pt-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Purpose badge (inline editable) */}
                              {isEditingPurpose ? (
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={editState.value}
                                    onValueChange={(v) => setEditState(prev => prev ? { ...prev, value: v } : null)}
                                  >
                                    <SelectTrigger className="h-6 text-xs w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="business">Zakelijk</SelectItem>
                                      <SelectItem value="personal">Privé</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit} disabled={!!savingId}>
                                    {savingId === trip.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Check className="h-3 w-3 text-green-600" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}>
                                    <X className="h-3 w-3 text-red-500" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEdit(trip.id, 'purpose', trip.purpose)}
                                  className="group flex items-center gap-1"
                                  title="Klik om te wijzigen"
                                >
                                  <Badge
                                    variant={isBiz ? 'default' : 'secondary'}
                                    className="text-xs cursor-pointer group-hover:opacity-80 transition-opacity"
                                  >
                                    {isBiz
                                      ? <><Briefcase className="h-2.5 w-2.5 mr-1" />Zakelijk</>
                                      : <><User className="h-2.5 w-2.5 mr-1" />Privé</>}
                                  </Badge>
                                  <Edit3 className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              )}

                              {trip.is_manual && (
                                <Badge variant="outline" className="text-xs">Handmatig</Badge>
                              )}
                            </div>

                            {/* Description (inline editable) */}
                            {isEditingDesc ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={editState.value}
                                  onChange={(e) => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit();
                                    if (e.key === 'Escape') cancelEdit();
                                  }}
                                  className="h-6 text-xs flex-1"
                                  placeholder="Omschrijving..."
                                  autoFocus
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={saveEdit} disabled={!!savingId}>
                                  {savingId === trip.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Check className="h-3 w-3 text-green-600" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={cancelEdit}>
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(trip.id, 'description', trip.description || '')}
                                className="group text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                              >
                                <span className="flex items-center gap-1">
                                  {trip.description
                                    ? <span className="italic break-words">"{trip.description}"</span>
                                    : <span className="opacity-40">+ omschrijving</span>}
                                  <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Vehicle + Maps link */}
                          <div className="flex items-center gap-2 flex-wrap pt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              {trip.vehicle?.display_name || 'Tesla'}
                            </span>
                            {trip.start_location && trip.end_location && (
                              <a
                                href={`https://www.google.com/maps/dir/${encodeURIComponent(trip.start_location)}/${encodeURIComponent(trip.end_location)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Navigation className="h-3 w-3" />
                                Route
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Right column: distance */}
                        <div className="flex flex-col items-end shrink-0 pt-1">
                          <div className="text-2xl font-bold text-primary">
                            {distance > 0 ? distance : '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">km</div>
                          <div className="text-xs text-muted-foreground mt-2 text-right">
                            <div>{trip.start_odometer_km.toLocaleString('nl-NL')}</div>
                            {trip.end_odometer_km && <div>{trip.end_odometer_km.toLocaleString('nl-NL')}</div>}
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
        );
      })}
    </div>
  );
};
