import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
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
  Gauge,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** synthetic = came from mileage_readings, not trips table */
  isSynthetic?: boolean;
  vehicle?: { display_name: string };
}

interface DayGroup {
  /** YYYY-MM-DD – used for sorting */
  isoDate: string;
  /** Formatted label, e.g. "maandag 15 april 2026" */
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD in local timezone from any ISO timestamp */
function isoLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '';
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function isoToLabel(isoDate: string): string {
  // isoDate = "YYYY-MM-DD"
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

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
      // ── 1. Fetch trips table ──────────────────────────────────────────────
      let tripsQuery = supabase
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

      if (filters.vehicleId && filters.vehicleId !== 'all')
        tripsQuery = tripsQuery.eq('vehicle_id', filters.vehicleId);
      if (filters.purpose && filters.purpose !== 'all')
        tripsQuery = tripsQuery.eq('purpose', filters.purpose);
      if (filters.startDate)
        tripsQuery = tripsQuery.gte('started_at', `${filters.startDate}T00:00:00`);
      if (filters.endDate)
        tripsQuery = tripsQuery.lte('started_at', `${filters.endDate}T23:59:59`);

      const { data: tripsData, error: tripsError } = await tripsQuery.limit(500);
      if (tripsError) throw tripsError;

      // ── 2. Fetch mileage_readings for days not covered by trips ──────────
      let mileageQuery = supabase
        .from('mileage_readings')
        .select(`
          id, vehicle_id, reading_date, odometer_km, daily_km,
          location_name, metadata,
          vehicle:vehicles(display_name)
        `)
        .eq('user_id', user.id)
        .gt('daily_km', 0)           // only days with actual driving
        .order('reading_date', { ascending: false });

      if (filters.vehicleId && filters.vehicleId !== 'all')
        mileageQuery = mileageQuery.eq('vehicle_id', filters.vehicleId);
      if (filters.startDate)
        mileageQuery = mileageQuery.gte('reading_date', filters.startDate);
      if (filters.endDate)
        mileageQuery = mileageQuery.lte('reading_date', filters.endDate);

      const { data: mileageData } = await mileageQuery.limit(500);

      // ── 3. Build a set of ISO dates already covered by the trips table ───
      const coveredDates = new Set<string>();
      for (const t of (tripsData || [])) {
        coveredDates.add(isoLocalDate(t.started_at));
      }

      // ── 4. Convert mileage_readings rows to synthetic Trip objects ────────
      const syntheticTrips: Trip[] = [];
      for (const r of (mileageData || [])) {
        if (coveredDates.has(r.reading_date)) continue; // already have a real trip

        // purpose filter: synthetic trips default to 'business'; skip if filter is 'personal'
        const purpose = 'business';
        if (filters.purpose && filters.purpose !== 'all' && filters.purpose !== purpose) continue;

        const meta = r.metadata as Record<string, any> | null ?? {};
        const startOdo = (meta.start_odometer_km as number) ?? (r.odometer_km - r.daily_km);
        const endOdo = r.odometer_km;

        syntheticTrips.push({
          id: `mileage-${r.id}`,
          vehicle_id: r.vehicle_id,
          // Use noon local time so timezone shifts never bleed into wrong day
          started_at: `${r.reading_date}T12:00:00`,
          ended_at: `${r.reading_date}T12:00:00`,
          start_location: meta.start_location as string | null ?? null,
          end_location: r.location_name ?? (meta.location_name as string | null) ?? null,
          start_odometer_km: startOdo,
          end_odometer_km: endOdo,
          purpose,
          description: null,
          is_manual: false,
          isSynthetic: true,
          vehicle: r.vehicle as { display_name: string } | undefined,
        });
      }

      // ── 5. Merge and group by local ISO date ─────────────────────────────
      const allTrips: Trip[] = [
        ...((tripsData || []) as Trip[]),
        ...syntheticTrips,
      ];

      const groups: Record<string, Trip[]> = {};
      for (const trip of allTrips) {
        const iso = isoLocalDate(trip.started_at);
        if (!groups[iso]) groups[iso] = [];
        groups[iso].push(trip);
      }

      const dist = (t: Trip) =>
        t.end_odometer_km ? t.end_odometer_km - t.start_odometer_km : 0;

      // Sort trips within each day by started_at ascending
      for (const iso of Object.keys(groups)) {
        groups[iso].sort(
          (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        );
      }

      const sorted: DayGroup[] = Object.keys(groups)
        .sort((a, b) => b.localeCompare(a))    // YYYY-MM-DD sort = correct chronological order
        .map(isoDate => ({
          isoDate,
          label: isoToLabel(isoDate),
          trips: groups[isoDate],
          totalKm: groups[isoDate].reduce((s, t) => s + dist(t), 0),
          businessKm: groups[isoDate].reduce(
            (s, t) => t.purpose === 'business' ? s + dist(t) : s, 0
          ),
          personalKm: groups[isoDate].reduce(
            (s, t) => t.purpose === 'personal' ? s + dist(t) : s, 0
          ),
        }));

      setDayGroups(sorted);
      if (sorted.length > 0) setOpenDays(new Set([sorted[0].isoDate]));
    } catch (err) {
      console.error('Error fetching trips:', err);
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
    }
  }, [user, refreshTrigger, filters]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const toggleDay = (isoDate: string) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      next.has(isoDate) ? next.delete(isoDate) : next.add(isoDate);
      return next;
    });
  };

  const startEdit = (tripId: string, field: 'purpose' | 'description', current: string) => {
    setEditState({ tripId, field, value: current });
  };
  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    if (editState.tripId.startsWith('mileage-')) {
      toast.info('Bewerk de rit na synchronisatie – deze dag heeft nog geen trip-record');
      setEditState(null);
      return;
    }
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

  // ── CSV export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const allTrips = dayGroups.flatMap(d => d.trips);
    if (allTrips.length === 0) return;

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Datum', 'Dag', 'Starttijd', 'Eindtijd', 'Duur',
      'Voertuig', 'Startlocatie', 'Eindlocatie',
      'Start km-stand', 'Eind km-stand', 'Afstand (km)',
      'Type rit', 'Omschrijving', 'Handmatig',
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

      return [
        startDate.toLocaleDateString('nl-NL'),
        startDate.toLocaleDateString('nl-NL', { weekday: 'long' }),
        trip.isSynthetic ? '' : startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        (trip.isSynthetic || !endDate) ? '' : endDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        trip.isSynthetic ? '' : durFmt,
        esc(trip.vehicle?.display_name || 'Tesla'),
        esc(trip.start_location || 'Onbekend'),
        esc(trip.end_location || 'Onbekend'),
        trip.start_odometer_km,
        trip.end_odometer_km || '',
        distance,
        isBiz ? 'Zakelijk' : 'Privé',
        esc(trip.description || ''),
        trip.is_manual ? 'Ja' : 'Nee',
      ].join(',');
    });

    const summary = [
      '', 'TOTAAL', '', '', '', '', '', '', '', '',
      totalBiz + totalPriv, '',
      esc(`Zakelijk: ${totalBiz} km | Privé: ${totalPriv} km`), '',
    ].join(',');

    const csv = '﻿' + [header, ...rows, '', summary].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ritregistratie-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Export gedownload');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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
        <p className="font-medium text-foreground">Geen ritten gevonden</p>
        <p className="text-sm mt-1">Pas de periode aan of klik op "Sync Tesla" om data op te halen</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Totalen balk ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3" /> Totaal
          </p>
          <p className="text-xl font-bold">{totals.km.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">{totals.trips} dag{totals.trips !== 1 ? 'en' : ''}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Briefcase className="h-3 w-3" /> Zakelijk
          </p>
          <p className="text-xl font-bold text-primary">{totals.biz.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">
            {totals.km > 0 ? Math.round(totals.biz / totals.km * 100) : 0}%
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <User className="h-3 w-3" /> Privé
          </p>
          <p className="text-xl font-bold">{totals.priv.toLocaleString('nl-NL')} km</p>
          <p className="text-xs text-muted-foreground">
            {totals.km > 0 ? Math.round(totals.priv / totals.km * 100) : 0}%
          </p>
        </Card>
        <Card className="p-3 flex items-center justify-center">
          <Button variant="outline" size="sm" onClick={exportCSV} className="w-full gap-2">
            <Download className="h-4 w-4" />
            CSV Export
          </Button>
        </Card>
      </div>

      {/* ── Dag-kaarten ── */}
      {dayGroups.map((day) => {
        const isOpen = openDays.has(day.isoDate);

        return (
          <Card key={day.isoDate} className="overflow-hidden">
            <Collapsible open={isOpen} onOpenChange={() => toggleDay(day.isoDate)}>

              {/* Dag-header */}
              <CollapsibleTrigger asChild>
                <button className="w-full text-left hover:bg-accent/20 transition-colors">
                  <div className="px-4 py-3 flex items-center gap-3">

                    {/* Datum + label */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base leading-tight capitalize">{day.label}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* km groot */}
                        <span className="text-lg font-bold text-primary">
                          {day.totalKm.toLocaleString('nl-NL')} km
                        </span>
                        {day.businessKm > 0 && (
                          <Badge variant="default" className="text-xs h-5 gap-1 px-1.5">
                            <Briefcase className="h-2.5 w-2.5" />
                            {day.businessKm.toLocaleString('nl-NL')} km zakelijk
                          </Badge>
                        )}
                        {day.personalKm > 0 && (
                          <Badge variant="secondary" className="text-xs h-5 gap-1 px-1.5">
                            <User className="h-2.5 w-2.5" />
                            {day.personalKm.toLocaleString('nl-NL')} km privé
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Chevron */}
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </div>
                </button>
              </CollapsibleTrigger>

              {/* Rit-rijen */}
              <CollapsibleContent>
                <div className="border-t divide-y">
                  {day.trips.map((trip) => {
                    const distance = trip.end_odometer_km
                      ? trip.end_odometer_km - trip.start_odometer_km
                      : 0;
                    const duration = (!trip.isSynthetic && trip.ended_at)
                      ? formatDuration(trip.started_at, trip.ended_at)
                      : null;
                    const isBiz = trip.purpose === 'business';
                    const isEditingPurpose =
                      editState?.tripId === trip.id && editState.field === 'purpose';
                    const isEditingDesc =
                      editState?.tripId === trip.id && editState.field === 'description';

                    return (
                      <div
                        key={trip.id}
                        className="px-4 py-3 hover:bg-accent/10 transition-colors"
                      >
                        <div className="flex gap-3">

                          {/* Route-indicator */}
                          <div className="flex flex-col items-center shrink-0 pt-1 gap-0.5">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <div className="w-px flex-1 bg-border min-h-[28px]" />
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                          </div>

                          {/* Inhoud */}
                          <div className="flex-1 min-w-0 space-y-1.5">

                            {/* Tijden */}
                            {!trip.isSynthetic && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>{formatTime(trip.started_at)}</span>
                                {trip.ended_at && (
                                  <>
                                    <ArrowRight className="h-3 w-3 shrink-0" />
                                    <span>{formatTime(trip.ended_at)}</span>
                                    {duration && (
                                      <span className="text-muted-foreground/60">
                                        ({duration})
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            {/* Locaties */}
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium leading-snug break-words">
                                {trip.start_location?.trim() ? (
                                  trip.start_location
                                ) : (
                                  <span className="italic text-xs text-muted-foreground">
                                    Startlocatie onbekend
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground leading-snug break-words">
                                {trip.end_location?.trim() ? (
                                  trip.end_location
                                ) : (
                                  <span className="italic text-xs">
                                    Eindlocatie onbekend
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Badges + omschrijving */}
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">

                              {/* Purpose badge */}
                              {isEditingPurpose ? (
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={editState!.value}
                                    onValueChange={v =>
                                      setEditState(prev => prev ? { ...prev, value: v } : null)
                                    }
                                  >
                                    <SelectTrigger className="h-6 text-xs w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="business">Zakelijk</SelectItem>
                                      <SelectItem value="personal">Privé</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button size="icon" variant="ghost" className="h-6 w-6"
                                    onClick={saveEdit} disabled={!!savingId}>
                                    {savingId === trip.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Check className="h-3 w-3 text-green-600" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6"
                                    onClick={cancelEdit}>
                                    <X className="h-3 w-3 text-red-500" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  onClick={() =>
                                    !trip.isSynthetic &&
                                    startEdit(trip.id, 'purpose', trip.purpose)
                                  }
                                  className={`group flex items-center gap-1 ${trip.isSynthetic ? 'cursor-default' : ''}`}
                                  title={trip.isSynthetic ? undefined : 'Klik om te wijzigen'}
                                >
                                  <Badge
                                    variant={isBiz ? 'default' : 'secondary'}
                                    className={`text-xs ${!trip.isSynthetic ? 'cursor-pointer group-hover:opacity-80' : ''}`}
                                  >
                                    {isBiz
                                      ? <><Briefcase className="h-2.5 w-2.5 mr-1" />Zakelijk</>
                                      : <><User className="h-2.5 w-2.5 mr-1" />Privé</>}
                                  </Badge>
                                  {!trip.isSynthetic && (
                                    <Edit3 className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </button>
                              )}

                              {trip.is_manual && (
                                <Badge variant="outline" className="text-xs">Handmatig</Badge>
                              )}
                              {trip.isSynthetic && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Odometer
                                </Badge>
                              )}

                              {/* Description */}
                              {!trip.isSynthetic && (
                                isEditingDesc ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <Input
                                      value={editState!.value}
                                      onChange={e =>
                                        setEditState(prev =>
                                          prev ? { ...prev, value: e.target.value } : null
                                        )
                                      }
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit();
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="h-6 text-xs"
                                      placeholder="Omschrijving..."
                                      autoFocus
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                                      onClick={saveEdit} disabled={!!savingId}>
                                      {savingId === trip.id
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <Check className="h-3 w-3 text-green-600" />}
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                                      onClick={cancelEdit}>
                                      <X className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() =>
                                      startEdit(trip.id, 'description', trip.description || '')
                                    }
                                    className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    {trip.description
                                      ? <span className="italic">"{trip.description}"</span>
                                      : <span className="opacity-40">+ omschrijving</span>}
                                    <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                  </button>
                                )
                              )}
                            </div>

                            {/* Voertuig + Maps */}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Car className="h-3 w-3" />
                                {trip.vehicle?.display_name || 'Tesla'}
                              </span>
                              {trip.start_odometer_km > 0 && trip.end_odometer_km && (
                                <span className="flex items-center gap-1">
                                  <Gauge className="h-3 w-3" />
                                  {trip.start_odometer_km.toLocaleString('nl-NL')}
                                  {' → '}
                                  {trip.end_odometer_km.toLocaleString('nl-NL')} km
                                </span>
                              )}
                              {trip.start_location && trip.end_location && (
                                <a
                                  href={`https://www.google.com/maps/dir/${encodeURIComponent(trip.start_location)}/${encodeURIComponent(trip.end_location)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Navigation className="h-3 w-3" />
                                  Route
                                </a>
                              )}
                            </div>

                          </div>

                          {/* Rechts: km */}
                          <div className="shrink-0 text-right pt-1">
                            <span className="text-2xl font-bold text-primary">
                              {distance > 0 ? distance.toLocaleString('nl-NL') : '—'}
                            </span>
                            <p className="text-xs text-muted-foreground">km</p>
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
