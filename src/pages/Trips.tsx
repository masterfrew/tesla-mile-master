import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DailyTripsView } from '@/components/DailyTripsView';
import { TripsCalendar } from '@/components/TripsCalendar';
import { TripsTable } from '@/components/TripsTable';
import { supabase } from '@/integrations/supabase/client';
import { Car, ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ManualTripForm } from '@/components/ManualTripForm';
import { MonthlyPdfReport } from '@/components/MonthlyPdfReport';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

// Returns YYYY-MM-DD string in local time
function toLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type PeriodPreset = 'week' | 'month' | 'year' | 'custom';

function getPresetDates(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const today = toLocalDate(now);

  if (preset === 'week') {
    const dayOfWeek = now.getDay(); // 0 = sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    return { start: toLocalDate(monday), end: today };
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toLocalDate(first), end: today };
  }
  if (preset === 'year') {
    const first = new Date(now.getFullYear(), 0, 1);
    return { start: toLocalDate(first), end: today };
  }
  return { start: '', end: '' };
}

const Trips = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [addTripOpen, setAddTripOpen] = useState(false);

  // Filters
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedPurpose, setSelectedPurpose] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePeriod, setActivePeriod] = useState<PeriodPreset | null>(null);

  const applyPreset = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      setActivePeriod('custom');
      return;
    }
    const { start, end } = getPresetDates(preset);
    setStartDate(start);
    setEndDate(end);
    setActivePeriod(preset);
  };

  const clearDates = () => {
    setStartDate('');
    setEndDate('');
    setActivePeriod(null);
  };

  const fetchVehicles = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, display_name, model, year')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('display_name');
      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Je moet ingelogd zijn om te synchroniseren'); return; }

      // Step 1: sync latest Tesla data
      const response = await supabase.functions.invoke('tesla-mileage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw new Error(response.error.message);

      // Step 2: fill in trips for any historical mileage readings without a trip record
      const backfillResponse = await supabase.functions.invoke('backfill-trips', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const syncResult = response.data;
      const backfillResult = backfillResponse.data;

      const parts: string[] = [];
      if (syncResult?.synced > 0) {
        parts.push(`${syncResult.synced} voertuig(en) gesynchroniseerd`);
      }
      if (backfillResult?.created > 0) {
        parts.push(`${backfillResult.created} ontbrekende rit(ten) aangevuld`);
      }

      if (parts.length > 0) {
        toast.success(parts.join(' · '));
      } else {
        toast.info('Geen nieuwe data om te synchroniseren');
      }

      setRefreshTrigger(prev => prev + 1);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Synchronisatie mislukt: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => { fetchVehicles(); }, [user]);

  if (vehicles.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto text-center py-16">
          <Car className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
          <h1 className="text-2xl font-bold mb-4">Geen voertuigen gevonden</h1>
          <p className="text-muted-foreground mb-6">Verbind eerst je Tesla account.</p>
          <Button onClick={() => window.history.back()}>Terug naar dashboard</Button>
        </div>
      </div>
    );
  }

  const tableFilters = {
    vehicleId: selectedVehicle,
    purpose: selectedPurpose,
    startDate,
    endDate,
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Ritregistratie</h1>
              <p className="text-sm text-muted-foreground">Kilometerregistratie overzicht</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={addTripOpen} onOpenChange={setAddTripOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Rit toevoegen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nieuwe rit toevoegen</DialogTitle>
                </DialogHeader>
                <ManualTripForm
                  vehicles={vehicles}
                  onTripAdded={() => {
                    setAddTripOpen(false);
                    setRefreshTrigger(prev => prev + 1);
                  }}
                />
              </DialogContent>
            </Dialog>
            <MonthlyPdfReport vehicles={vehicles} />
            <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sync...' : 'Sync Tesla'}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            {/* Periode presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium mr-1">Periode:</span>
              {(['week', 'month', 'year'] as const).map(p => {
                const labels: Record<string, string> = { week: 'Deze week', month: 'Deze maand', year: 'Dit jaar' };
                return (
                  <Button
                    key={p}
                    variant={activePeriod === p ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => applyPreset(p)}
                  >
                    {labels[p]}
                  </Button>
                );
              })}
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-xs text-muted-foreground"
                  onClick={clearDates}
                >
                  Wis filter
                </Button>
              )}
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Voertuig</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle voertuigen</SelectItem>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type rit</Label>
                <Select value={selectedPurpose} onValueChange={setSelectedPurpose}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle typen</SelectItem>
                    <SelectItem value="business">Zakelijk</SelectItem>
                    <SelectItem value="personal">Privé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vanaf datum</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setActivePeriod('custom'); }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tot datum</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setActivePeriod('custom'); }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main tabs */}
        <Tabs defaultValue="daily">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="table">Rittenlijst</TabsTrigger>
            <TabsTrigger value="daily">Dagrapport</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-4">
            <TripsTable
              refreshTrigger={refreshTrigger}
              vehicles={vehicles}
              filters={tableFilters}
              onTripChanged={() => setRefreshTrigger(prev => prev + 1)}
            />
          </TabsContent>

          <TabsContent value="daily" className="mt-4">
            <DailyTripsView
              refreshTrigger={refreshTrigger}
              filters={{
                vehicleId: selectedVehicle,
                purpose: selectedPurpose,
                startDate,
                endDate,
              }}
            />
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <TripsCalendar
              refreshTrigger={refreshTrigger}
              filters={{ vehicleId: selectedVehicle }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trips;
