import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Download,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
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
  vehicle?: { display_name: string; model: string; year: number } | null;
}

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface TripsTableProps {
  refreshTrigger: number;
  vehicles: Vehicle[];
  filters: {
    vehicleId: string;
    purpose: string;
    startDate: string;
    endDate: string;
  };
  onTripChanged: () => void;
}

type SortField = 'date' | 'from' | 'to' | 'km';
type SortDir = 'asc' | 'desc';

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDayName(iso: string) {
  return DAY_NAMES[new Date(iso).getDay()];
}

function calcKm(trip: Trip) {
  return trip.end_odometer_km != null
    ? Math.max(0, trip.end_odometer_km - trip.start_odometer_km)
    : 0;
}

export const TripsTable: React.FC<TripsTableProps> = ({
  refreshTrigger,
  vehicles,
  filters,
  onTripChanged,
}) => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);

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
          vehicle:vehicles(display_name, model, year)
        `)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      if (filters.vehicleId && filters.vehicleId !== 'all')
        query = query.eq('vehicle_id', filters.vehicleId);
      if (filters.purpose && filters.purpose !== 'all')
        query = query.eq('purpose', filters.purpose);
      if (filters.startDate)
        query = query.gte('started_at', `${filters.startDate}T00:00:00`);
      if (filters.endDate)
        query = query.lte('started_at', `${filters.endDate}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      setTrips((data || []) as Trip[]);
    } catch (err) {
      toast.error('Fout bij ophalen van ritten');
    } finally {
      setLoading(false);
    }
  }, [user, filters, refreshTrigger]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const sorted = [...trips].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') cmp = a.started_at.localeCompare(b.started_at);
    else if (sortField === 'from') cmp = (a.start_location ?? '').localeCompare(b.start_location ?? '');
    else if (sortField === 'to') cmp = (a.end_location ?? '').localeCompare(b.end_location ?? '');
    else if (sortField === 'km') cmp = calcKm(a) - calcKm(b);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleDelete = async () => {
    if (!deletingTripId) return;
    try {
      const { error } = await supabase.from('trips').delete().eq('id', deletingTripId);
      if (error) throw error;
      toast.success('Rit verwijderd');
      fetchTrips();
      onTripChanged();
    } catch {
      toast.error('Fout bij verwijderen');
    } finally {
      setDeletingTripId(null);
    }
  };

  // ── Export helpers ──────────────────────────────────────────────────────────

  function buildRows() {
    return sorted.map(trip => ({
      Datum: formatDate(trip.started_at),
      Dag: getDayName(trip.started_at),
      Van: trip.start_location ?? '',
      Naar: trip.end_location ?? '',
      'KM': calcKm(trip),
      'Zakelijk/Privé': trip.purpose === 'business' ? 'Zakelijk' : 'Privé',
      Notities: trip.description ?? '',
      Voertuig: trip.vehicle?.display_name ?? '',
    }));
  }

  function exportCSV() {
    const rows = buildRows();
    const header = Object.keys(rows[0] ?? {}).join(';');
    const lines = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')
    );
    const totalKm = sorted.reduce((s, t) => s + calcKm(t), 0);
    const totalBiz = sorted.filter(t => t.purpose === 'business').reduce((s, t) => s + calcKm(t), 0);
    const totalPriv = sorted.filter(t => t.purpose !== 'business').reduce((s, t) => s + calcKm(t), 0);
    lines.push('');
    lines.push(`"Totaal";"";"";"";"${totalKm}";"Z: ${totalBiz} / P: ${totalPriv}";""`);

    const csv = '\ufeff' + [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ritregistratie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV gedownload');
  }

  function exportXLSX() {
    const rows = buildRows();
    const totalKm = sorted.reduce((s, t) => s + calcKm(t), 0);
    const totalBiz = sorted.filter(t => t.purpose === 'business').reduce((s, t) => s + calcKm(t), 0);
    const totalPriv = sorted.filter(t => t.purpose !== 'business').reduce((s, t) => s + calcKm(t), 0);

    const summaryRow = {
      Datum: 'TOTAAL',
      Dag: '',
      Van: '',
      Naar: '',
      KM: totalKm,
      'Zakelijk/Privé': `Z: ${totalBiz} / P: ${totalPriv}`,
      Notities: '',
      Voertuig: '',
    };

    const ws = XLSX.utils.json_to_sheet([...rows, {}, summaryRow]);

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Datum
      { wch: 5 },  // Dag
      { wch: 28 }, // Van
      { wch: 28 }, // Naar
      { wch: 8 },  // KM
      { wch: 14 }, // Zakelijk/Privé
      { wch: 30 }, // Notities
      { wch: 20 }, // Voertuig
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ritten');
    XLSX.writeFile(wb, `ritregistratie-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel gedownload');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  function Th({ field, label }: { field: SortField; label: string }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon field={field} />
        </span>
      </th>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalKm = sorted.reduce((s, t) => s + calcKm(t), 0);
  const totalBiz = sorted.filter(t => t.purpose === 'business').reduce((s, t) => s + calcKm(t), 0);
  const totalPriv = sorted.filter(t => t.purpose !== 'business').reduce((s, t) => s + calcKm(t), 0);

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{sorted.length}</strong> ritten</span>
          <span><strong className="text-foreground">{totalKm.toLocaleString('nl-NL')}</strong> km totaal</span>
          <span className="text-green-600 dark:text-green-400">
            <strong>{totalBiz.toLocaleString('nl-NL')}</strong> zakelijk
          </span>
          <span className="text-muted-foreground">
            <strong>{totalPriv.toLocaleString('nl-NL')}</strong> privé
          </span>
        </div>

        {sorted.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exporteren
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportXLSX}>
                <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                Download Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Download CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p className="text-sm">Geen ritten gevonden voor de geselecteerde periode</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <Th field="date" label="Datum" />
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Dag</th>
                  <Th field="from" label="Van" />
                  <Th field="to" label="Naar" />
                  <Th field="km" label="KM" />
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notities</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((trip, i) => {
                  const km = calcKm(trip);
                  const isBusiness = trip.purpose === 'business';
                  return (
                    <tr
                      key={trip.id}
                      className={`hover:bg-accent/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/20'}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDate(trip.started_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {getDayName(trip.started_at)}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={trip.start_location ?? ''}>
                        {trip.start_location || <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={trip.end_location ?? ''}>
                        {trip.end_location || <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums font-medium text-right">
                        {km > 0 ? `${km} km` : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={isBusiness ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {isBusiness ? 'Zakelijk' : 'Privé'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={trip.description ?? ''}>
                        {trip.description || ''}
                      </td>
                      <td className="px-2 py-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingTrip(trip)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Bewerken
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeletingTripId(trip.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Verwijderen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">
                    Totaal
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums font-bold text-right">
                    {totalKm.toLocaleString('nl-NL')} km
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={3}>
                    <span className="text-green-600 dark:text-green-400">{totalBiz.toLocaleString('nl-NL')} zakelijk</span>
                    {' / '}
                    <span>{totalPriv.toLocaleString('nl-NL')} privé</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <EditTripDialog
        trip={editingTrip}
        vehicles={vehicles}
        open={!!editingTrip}
        onOpenChange={open => !open && setEditingTrip(null)}
        onTripUpdated={() => { setEditingTrip(null); fetchTrips(); onTripChanged(); }}
      />

      <AlertDialog open={!!deletingTripId} onOpenChange={open => !open && setDeletingTripId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze rit wordt permanent verwijderd en kan niet worden hersteld.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
