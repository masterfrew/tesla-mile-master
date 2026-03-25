import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TripsList } from '@/components/TripsList';
import { NewTripsList } from '@/components/NewTripsList';
import { DailyTripsView } from '@/components/DailyTripsView';
import { TripsCalendar } from '@/components/TripsCalendar';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
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

      const response = await supabase.functions.invoke('tesla-mileage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) throw new Error(response.error.message);

      const result = response.data;
      if (result.synced > 0) {
        toast.success(`${result.synced} voertuig(en) gesynchroniseerd`);
        setRefreshTrigger(prev => prev + 1);
      } else {
        toast.info('Geen nieuwe data om te synchroniseren');
      }
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

  const filters = {
    vehicleId: selectedVehicle,
    purpose: selectedPurpose,
    startDate,
    endDate,
    startTime: '',
    endTime: '',
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Ritregistratie</h1>
              <p className="text-muted-foreground">Alle ritten op een rij</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={addTripOpen} onOpenChange={setAddTripOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
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
            <Button onClick={handleSync} disabled={isSyncing} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sync...' : 'Sync Tesla'}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Voertuig</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tot datum</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main tabs */}
        <Tabs defaultValue="daily">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="calendar">📅 Kalender</TabsTrigger>
            <TabsTrigger value="daily">📋 Per dag</TabsTrigger>
            <TabsTrigger value="all">📄 Alle ritten</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <TripsCalendar
              refreshTrigger={refreshTrigger}
              filters={{ vehicleId: selectedVehicle }}
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

          <TabsContent value="all" className="mt-4">
            <NewTripsList
              refreshTrigger={refreshTrigger}
              vehicles={vehicles}
              filters={filters}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trips;
