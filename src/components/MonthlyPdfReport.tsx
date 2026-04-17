import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Vehicle {
  id: string;
  display_name: string;
}

interface MonthlyPdfReportProps {
  vehicles: Vehicle[];
}

interface TripRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_location: string | null;
  end_location: string | null;
  start_odometer_km: number;
  end_odometer_km: number | null;
  purpose: string;
  description: string | null;
  vehicle?: { display_name: string } | null;
}

const MONTHS = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

export const MonthlyPdfReport: React.FC<MonthlyPdfReportProps> = ({ vehicles }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth())); // 0-indexed
  const [vehicleId, setVehicleId] = useState<string>('all');

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const fmtTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      const start = new Date(y, m, 1).toISOString();
      const end = new Date(y, m + 1, 1).toISOString();

      let query = supabase
        .from('trips')
        .select('id, started_at, ended_at, start_location, end_location, start_odometer_km, end_odometer_km, purpose, description, vehicle:vehicles(display_name)')
        .eq('user_id', user.id)
        .gte('started_at', start)
        .lt('started_at', end)
        .order('started_at', { ascending: true });

      if (vehicleId !== 'all') query = query.eq('vehicle_id', vehicleId);

      const { data, error } = await query;
      if (error) throw error;
      const trips = (data || []) as TripRow[];

      if (trips.length === 0) {
        toast.error('Geen ritten gevonden voor deze maand');
        return;
      }

      // Group by day
      const byDay = new Map<string, TripRow[]>();
      for (const t of trips) {
        const key = t.started_at.slice(0, 10);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(t);
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Ritregistratie', 14, 15);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const periodLabel = `${MONTHS[m]} ${y}`;
      const vehicleLabel = vehicleId === 'all'
        ? 'Alle voertuigen'
        : vehicles.find(v => v.id === vehicleId)?.display_name ?? '';
      doc.text(`Periode: ${periodLabel}`, 14, 22);
      doc.text(`Voertuig: ${vehicleLabel}`, 14, 28);
      doc.text(`Gegenereerd: ${new Date().toLocaleString('nl-NL')}`, pageWidth - 14, 22, { align: 'right' });

      // Build rows: per day a header-like row then trips, then day subtotal
      const body: Array<Array<string | { content: string; colSpan?: number; styles?: Record<string, unknown> }>> = [];
      let grandBusiness = 0;
      let grandPersonal = 0;
      let grandTotal = 0;

      const days = Array.from(byDay.keys()).sort();
      for (const dayKey of days) {
        const dayTrips = byDay.get(dayKey)!;
        let dayBusiness = 0;
        let dayPersonal = 0;
        let dayTotal = 0;

        // Day header row
        body.push([{
          content: fmtDate(dayKey),
          colSpan: 8,
          styles: { fillColor: [230, 230, 235], fontStyle: 'bold', textColor: 20 },
        }]);

        for (const t of dayTrips) {
          const km = t.end_odometer_km != null ? Math.max(0, t.end_odometer_km - t.start_odometer_km) : 0;
          dayTotal += km;
          if (t.purpose === 'business') dayBusiness += km;
          else dayPersonal += km;

          body.push([
            fmtTime(t.started_at),
            fmtTime(t.ended_at),
            t.start_location || '-',
            t.end_location || '-',
            km.toFixed(1),
            t.purpose === 'business' ? 'Zakelijk' : 'Privé',
            t.vehicle?.display_name || '-',
            t.description || '',
          ]);
        }

        // Day subtotal
        body.push([
          { content: 'Dagtotaal', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: dayTotal.toFixed(1), styles: { fontStyle: 'bold' } },
          { content: `Z: ${dayBusiness.toFixed(1)} / P: ${dayPersonal.toFixed(1)}`, colSpan: 3, styles: { fontStyle: 'bold' } },
        ]);

        grandBusiness += dayBusiness;
        grandPersonal += dayPersonal;
        grandTotal += dayTotal;
      }

      autoTable(doc, {
        startY: 34,
        head: [['Vertrek', 'Aankomst', 'Van', 'Naar', 'Km', 'Type', 'Voertuig', 'Beschrijving']],
        body,
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [40, 40, 50], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 18 },
          2: { cellWidth: 50 },
          3: { cellWidth: 50 },
          4: { cellWidth: 16, halign: 'right' },
          5: { cellWidth: 18 },
          6: { cellWidth: 30 },
        },
        didDrawPage: () => {
          const pageCount = doc.getNumberOfPages();
          const pageNum = doc.getCurrentPageInfo().pageNumber;
          doc.setFontSize(8);
          doc.text(`Pagina ${pageNum} / ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        },
      });

      // Summary box
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Maandtotaal', 14, finalY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Totaal gereden: ${grandTotal.toFixed(1)} km`, 14, finalY + 7);
      doc.text(`Zakelijk: ${grandBusiness.toFixed(1)} km`, 14, finalY + 13);
      doc.text(`Privé: ${grandPersonal.toFixed(1)} km`, 14, finalY + 19);
      doc.text(`Aantal ritten: ${trips.length}`, 14, finalY + 25);

      const filename = `ritregistratie-${y}-${String(m + 1).padStart(2, '0')}.pdf`;
      doc.save(filename);
      toast.success('PDF gegenereerd');
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Genereren mislukt: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="h-4 w-4 mr-2" />
          PDF rapport
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maandrapport (PDF)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Maand</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Jaar</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Voertuig</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle voertuigen</SelectItem>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Het rapport groepeert ritten per dag met dagtotaal en eindigt met een maandtotaal voor zakelijk en privé — geschikt voor de boekhouder of belastingdienst.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={generating}>Annuleren</Button>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Genereer PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
