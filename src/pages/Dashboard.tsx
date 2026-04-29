import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { useOnboarding } from '@/hooks/useOnboarding';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
  Car,
  TrendingUp,
  Calendar,
  MapPin,
  Loader2,
  RefreshCw,
  Trash2,
  MoreVertical,
  Zap,
  BarChart3,
  Shield,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import TeslaConnect from '@/components/TeslaConnect';
import OnboardingFlow from '@/components/OnboardingFlow';
import { AppNav } from '@/components/AppNav';

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  subscription_tier: string;
}

interface Vehicle {
  id: string;
  display_name: string | null;
  model: string | null;
  year: number | null;
  vin: string;
  is_active: boolean;
}

interface MileageStats {
  thisMonth: number;
  thisYear: number;
  monthlyAverage: number;
}

interface RecentTrip {
  id: string;
  started_at: string;
  start_location: string | null;
  end_location: string | null;
  start_odometer_km: number;
  end_odometer_km: number | null;
  purpose: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { showOnboarding, completeOnboarding, skipOnboarding } = useOnboarding();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mileageStats, setMileageStats] = useState<MileageStats>({ thisMonth: 0, thisYear: 0, monthlyAverage: 0 });
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVehicles();
      fetchMileageStats();
      fetchRecentTrips();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMileageStats = async () => {
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

      const { data: monthData } = await supabase
        .from('mileage_readings')
        .select('daily_km')
        .eq('user_id', user?.id)
        .gte('reading_date', firstDayOfMonth);

      const thisMonth = monthData?.reduce((sum, r) => sum + (r.daily_km || 0), 0) || 0;

      const { data: yearData } = await supabase
        .from('mileage_readings')
        .select('daily_km')
        .eq('user_id', user?.id)
        .gte('reading_date', firstDayOfYear);

      const thisYear = yearData?.reduce((sum, r) => sum + (r.daily_km || 0), 0) || 0;
      const monthsElapsed = now.getMonth() + 1;
      const monthlyAverage = monthsElapsed > 0 ? Math.round(thisYear / monthsElapsed) : 0;

      setMileageStats({ thisMonth, thisYear, monthlyAverage });
    } catch (error) {
      console.error('Error fetching mileage stats:', error);
    }
  };

  const fetchRecentTrips = async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('id, started_at, start_location, end_location, start_odometer_km, end_odometer_km, purpose')
        .eq('user_id', user?.id)
        .order('started_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      setRecentTrips(data || []);
    } catch (error) {
      console.error('Error fetching recent trips:', error);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Geen actieve sessie'); return; }

      const { data, error } = await supabase.functions.invoke('tesla-mileage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) { toast.error('Kon niet synchroniseren met Tesla'); return; }

      toast.success(`${data?.synced || 0} voertuig(en) gesynchroniseerd!`);
      await fetchVehicles();
      await fetchMileageStats();
      await fetchRecentTrips();
    } catch (error) {
      toast.error('Er ging iets mis bij het synchroniseren');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteVehicleId) return;
    try {
      await supabase.from('mileage_readings').delete().eq('vehicle_id', deleteVehicleId);
      const { error } = await supabase.from('vehicles').delete().eq('id', deleteVehicleId);
      if (error) throw error;
      toast.success('Voertuig verwijderd');
      setDeleteVehicleId(null);
      await fetchVehicles();
      await fetchMileageStats();
    } catch (error) {
      toast.error('Kon voertuig niet verwijderen');
    }
  };

  const handleDisconnectTesla = async () => {
    setDisconnecting(true);
    setShowDisconnectDialog(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Geen actieve sessie'); return; }

      const { error } = await supabase.functions.invoke('tesla-disconnect', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) { toast.error('Kon Tesla koppeling niet verbreken'); return; }

      toast.success('Tesla koppeling verbroken');
      await fetchProfile();
      await fetchVehicles();
      await fetchMileageStats();
    } catch (error) {
      toast.error('Er ging iets mis bij het verbreken van de Tesla koppeling');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingFlow onComplete={completeOnboarding} onSkip={skipOnboarding} />
      )}
      <div className="min-h-screen bg-background">
        <AppNav />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {vehicles.length === 0 ? (
            /* ── No vehicles: connect Tesla ────────────────────────────────── */
            <div className="text-center py-12">
              <div className="bg-muted/50 p-8 rounded-2xl max-w-xl mx-auto">
                <div className="bg-primary/10 p-4 rounded-full w-fit mx-auto mb-6">
                  <Car className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Verbind je Tesla</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  Koppel je Tesla account om automatisch je kilometerstand bij te houden.
                </p>

                <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
                  <div className="text-center">
                    <div className="bg-primary/10 p-2 rounded-full w-fit mx-auto mb-2">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-medium text-xs">Automatische sync</p>
                  </div>
                  <div className="text-center">
                    <div className="bg-primary/10 p-2 rounded-full w-fit mx-auto mb-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-medium text-xs">Rapportages</p>
                  </div>
                  <div className="text-center">
                    <div className="bg-primary/10 p-2 rounded-full w-fit mx-auto mb-2">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-medium text-xs">Veilig & privé</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                  <TeslaConnect />
                </div>
              </div>
            </div>
          ) : (
            /* ── Dashboard with vehicles ────────────────────────────────────── */
            <div className="space-y-5">

              {/* Page header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold">
                    Welkom{profile?.first_name ? `, ${profile.first_name}` : ''}
                  </h1>
                  <p className="text-sm text-muted-foreground">Kilometerregistratie overzicht</p>
                </div>
                <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Sync...' : 'Sync Tesla'}
                </Button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Deze maand</CardTitle>
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-2xl font-bold">
                      {mileageStats.thisMonth > 0
                        ? `${mileageStats.thisMonth.toLocaleString('nl-NL')}`
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">km</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Dit jaar</CardTitle>
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-2xl font-bold">
                      {mileageStats.thisYear > 0
                        ? `${mileageStats.thisYear.toLocaleString('nl-NL')}`
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">km</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Gem. p/maand</CardTitle>
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-2xl font-bold">
                      {mileageStats.monthlyAverage > 0
                        ? `${mileageStats.monthlyAverage.toLocaleString('nl-NL')}`
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">km</p>
                  </CardContent>
                </Card>
              </div>

              {/* Main grid */}
              <div className="grid lg:grid-cols-3 gap-5">

                {/* Recent trips (2/3 width) */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        Recente ritten
                      </CardTitle>
                      <Link to="/trips">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                          Alle ritten
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {recentTrips.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">Nog geen ritten — klik op Sync Tesla</p>
                        <Link to="/trips">
                          <Button variant="outline" size="sm" className="mt-3 text-xs">
                            Naar ritten
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="divide-y -mx-6">
                        {recentTrips.map((trip) => {
                          const distance = trip.end_odometer_km
                            ? trip.end_odometer_km - trip.start_odometer_km
                            : 0;
                          const isBiz = trip.purpose === 'business';
                          return (
                            <div key={trip.id} className="flex items-center gap-3 px-6 py-2.5 hover:bg-accent/20 transition-colors">
                              <div className="text-xs text-muted-foreground w-20 shrink-0 tabular-nums">
                                {new Date(trip.started_at).toLocaleDateString('nl-NL', {
                                  day: 'numeric', month: 'short',
                                })}
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-1 text-sm truncate">
                                <span className="truncate">{trip.start_location || '—'}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{trip.end_location || '—'}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  variant={isBiz ? 'default' : 'secondary'}
                                  className="text-[10px] px-1.5 h-4"
                                >
                                  {isBiz ? 'Zakelijk' : 'Privé'}
                                </Badge>
                                <span className="text-sm font-semibold tabular-nums w-14 text-right">
                                  {distance > 0 ? `${distance} km` : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Vehicle card (1/3 width) */}
                <div className="space-y-4">
                  {vehicles.map((vehicle) => (
                    <Card key={vehicle.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="bg-primary/10 p-1.5 rounded-lg">
                              <Car className="h-4 w-4 text-primary" />
                            </div>
                            {vehicle.display_name || `${vehicle.model} ${vehicle.year}`}
                          </CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteVehicleId(vehicle.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Verwijder voertuig
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          VIN ···{vehicle.vin.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2">
                          {vehicle.is_active && (
                            <Badge variant="secondary" className="text-xs">Actief</Badge>
                          )}
                        </div>
                        <Link to="/trips" className="block">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            <MapPin className="h-3.5 w-3.5 mr-1.5" />
                            Bekijk ritten
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Tesla connection management */}
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground justify-start gap-2"
                        onClick={() => setShowDisconnectDialog(true)}
                        disabled={disconnecting}
                      >
                        <Unplug className="h-3.5 w-3.5" />
                        {disconnecting ? 'Verbreken...' : 'Tesla koppeling verbreken'}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Delete vehicle dialog */}
        <AlertDialog open={!!deleteVehicleId} onOpenChange={() => setDeleteVehicleId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Voertuig verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Dit verwijdert het voertuig en alle bijbehorende kilometerregistraties permanent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVehicle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Verwijderen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Disconnect Tesla dialog */}
        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tesla koppeling verbreken?</AlertDialogTitle>
              <AlertDialogDescription>
                Dit verwijdert alle voertuigen, kilometerregistraties en de Tesla toegangstokens.
                Je kunt daarna opnieuw je Tesla account koppelen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={handleDisconnectTesla} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Verbreek koppeling
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </>
  );
};

export default Dashboard;
