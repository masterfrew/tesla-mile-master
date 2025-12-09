import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  Plus, 
  Settings, 
  TrendingUp, 
  Calendar,
  Download,
  Zap,
  MapPin,
  BarChart3,
  Shield,
  Loader2,
  LogOut,
  User,
  RefreshCw,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import TeslaConnect from '@/components/TeslaConnect';

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

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminCheck();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mileageStats, setMileageStats] = useState<MileageStats>({ thisMonth: 0, thisYear: 0, monthlyAverage: 0 });
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
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Kon profiel niet laden');
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

      // Get this month's mileage
      const { data: monthData } = await supabase
        .from('mileage_readings')
        .select('daily_km')
        .eq('user_id', user?.id)
        .gte('reading_date', firstDayOfMonth);

      const thisMonth = monthData?.reduce((sum, r) => sum + (r.daily_km || 0), 0) || 0;

      // Get this year's mileage
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

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      toast.info('Tesla data synchroniseren...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Geen actieve sessie');
        return;
      }

      const { data, error } = await supabase.functions.invoke('tesla-mileage', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Sync error:', error);
        toast.error('Kon niet synchroniseren met Tesla');
        return;
      }

      toast.success(`${data?.synced || 0} voertuig(en) gesynchroniseerd!`);
      
      // Refresh data
      await fetchVehicles();
      await fetchMileageStats();
    } catch (error) {
      console.error('Sync exception:', error);
      toast.error('Er ging iets mis bij het synchroniseren');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteVehicleId) return;

    try {
      // First delete all mileage readings for this vehicle
      const { error: mileageError } = await supabase
        .from('mileage_readings')
        .delete()
        .eq('vehicle_id', deleteVehicleId);

      if (mileageError) throw mileageError;

      // Then delete the vehicle
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', deleteVehicleId);

      if (vehicleError) throw vehicleError;

      toast.success('Voertuig verwijderd');
      setDeleteVehicleId(null);
      
      // Refresh data
      await fetchVehicles();
      await fetchMileageStats();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      toast.error('Kon voertuig niet verwijderen');
    }
  };

  const handleDisconnectTesla = async () => {
    setDisconnecting(true);
    setShowDisconnectDialog(false);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Geen actieve sessie');
        return;
      }

      const { error } = await supabase.functions.invoke('tesla-disconnect', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error disconnecting Tesla:', error);
        toast.error('Kon Tesla koppeling niet verbreken');
        return;
      }

      toast.success('Tesla koppeling verbroken');
      
      // Refresh data
      await fetchProfile();
      await fetchVehicles();
      await fetchMileageStats();
    } catch (error) {
      console.error('Exception disconnecting Tesla:', error);
      toast.error('Er ging iets mis bij het verbreken van de Tesla koppeling');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span>Laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-lg">
                <Car className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Tesla Kilometerregistratie</h1>
                <p className="text-sm text-muted-foreground">
                  Welkom, {profile?.first_name} {profile?.last_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={profile?.subscription_tier === 'premium' ? 'default' : 'secondary'}>
                {profile?.subscription_tier === 'premium' ? 'Premium' : 'Basis'}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Mijn Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>
                    <User className="h-4 w-4 mr-2" />
                    Profiel bewerken
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSync} disabled={syncing || vehicles.length === 0}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Synchroniseren...' : 'Tesla synchroniseren'}
                  </DropdownMenuItem>
                  {vehicles.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setShowDisconnectDialog(true)} 
                        disabled={disconnecting}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {disconnecting ? 'Verbreken...' : 'Verbreek Tesla koppeling'}
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <Link to="/admin">
                        <DropdownMenuItem>
                          <Shield className="h-4 w-4 mr-2" />
                          Admin Dashboard
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Uitloggen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {vehicles.length === 0 ? (
          // No vehicles state
          <div className="text-center py-12">
            <div className="bg-muted/50 p-8 rounded-2xl max-w-2xl mx-auto">
              <div className="bg-primary/10 p-4 rounded-full w-fit mx-auto mb-6">
                <Car className="h-12 w-12 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Verbind uw Tesla</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Koppel uw Tesla-account om automatisch uw kilometerstand bij te houden 
                en uitgebreide rapportages te genereren.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4">
                  <div className="bg-accent/10 p-3 rounded-full w-fit mx-auto mb-3">
                    <Zap className="h-6 w-6 text-accent" />
                  </div>
                  <h3 className="font-semibold mb-2">Automatische sync</h3>
                  <p className="text-sm text-muted-foreground">
                    Dagelijkse updates van uw kilometerstand
                  </p>
                </div>
                <div className="text-center p-4">
                  <div className="bg-success/10 p-3 rounded-full w-fit mx-auto mb-3">
                    <BarChart3 className="h-6 w-6 text-success" />
                  </div>
                  <h3 className="font-semibold mb-2">Uitgebreide rapportages</h3>
                  <p className="text-sm text-muted-foreground">
                    Maandelijkse en jaarlijkse overzichten
                  </p>
                </div>
                <div className="text-center p-4">
                  <div className="bg-tesla-red/10 p-3 rounded-full w-fit mx-auto mb-3">
                    <Shield className="h-6 w-6 text-tesla-red" />
                  </div>
                  <h3 className="font-semibold mb-2">Veilig & privé</h3>
                  <p className="text-sm text-muted-foreground">
                    GDPR-compliant en versleutelde opslag
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                  <div className="mb-3">
                    <h3 className="font-semibold mb-2 text-foreground flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" />
                      Eenvoudig in één klik verbinden
                    </h3>
                    <p className="text-sm text-foreground/80">
                      Klik op de knop hieronder om uw Tesla account te verbinden. We registreren automatisch uw account en starten de veilige OAuth flow.
                    </p>
                  </div>
                  <TeslaConnect />
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Dashboard with vehicles
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stats Cards */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Deze maand</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mileageStats.thisMonth > 0 ? `${mileageStats.thisMonth.toLocaleString('nl-NL')} km` : 'Geen data'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mileageStats.thisMonth > 0 ? 'Huidige maand' : 'Synchroniseer uw Tesla'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dit jaar</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mileageStats.thisYear > 0 ? `${mileageStats.thisYear.toLocaleString('nl-NL')} km` : 'Geen data'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mileageStats.monthlyAverage > 0 
                    ? `Gemiddeld ${mileageStats.monthlyAverage.toLocaleString('nl-NL')} km/maand`
                    : 'Synchroniseer uw Tesla'
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Actieve voertuigen</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vehicles.length}</div>
                <p className="text-xs text-muted-foreground">
                  Alle voertuigen actief
                </p>
              </CardContent>
            </Card>

            {/* Vehicle List */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Uw Voertuigen</CardTitle>
                <CardDescription>
                  Overzicht van alle geregistreerde Tesla's
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="bg-primary/10 p-3 rounded-lg">
                        <Car className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            {vehicle.display_name || `${vehicle.model} ${vehicle.year}`}
                          </h3>
                          {vehicle.is_active && (
                            <Badge variant="secondary" className="text-xs">Actief</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          VIN: {vehicle.vin.slice(-6)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to="/trips">
                          <Button variant="outline" size="sm">
                            <MapPin className="h-4 w-4 mr-2" />
                            Bekijk ritten
                          </Button>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Snelle acties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Synchroniseren...' : 'Kilometerstand synchroniseren'}
                </Button>
                <Link to="/trips" className="block">
                  <Button className="w-full justify-start" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Rithistorie & Export
                  </Button>
                </Link>
                <Link to="/trips" className="block">
                  <Button className="w-full justify-start" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Nieuwe rit toevoegen
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteVehicleId} onOpenChange={() => setDeleteVehicleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert het voertuig en alle bijbehorende kilometerregistraties permanent. 
              Deze actie kan niet ongedaan worden gemaakt.
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

      {/* Disconnect Tesla Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tesla koppeling verbreken?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert alle voertuigen, kilometerregistraties en de Tesla toegangstokens. 
              Je kunt daarna opnieuw je Tesla account koppelen als je dat wilt.
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
  );
};

export default Dashboard;