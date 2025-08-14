import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
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
  Shield
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVehicles();
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
      toast({
        title: "Fout bij laden profiel",
        description: "Kon profiel niet laden.",
        variant: "destructive",
      });
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

  const handleSignOut = async () => {
    await signOut();
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
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <Settings className="h-4 w-4" />
              </Button>
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

              <Link to="/add-vehicle">
                <Button size="lg" className="bg-accent hover:bg-accent/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Voertuig toevoegen
                </Button>
              </Link>
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
                <div className="text-2xl font-bold">1,247 km</div>
                <p className="text-xs text-muted-foreground">
                  +12% t.o.v. vorige maand
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dit jaar</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12,458 km</div>
                <p className="text-xs text-muted-foreground">
                  Gemiddeld 1,038 km/maand
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
                      <Button variant="outline" size="sm">
                        <MapPin className="h-4 w-4 mr-2" />
                        Details
                      </Button>
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
                <Link to="/trips">
                  <Button className="w-full justify-start" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Nieuwe rit toevoegen
                  </Button>
                </Link>
                <Button className="w-full justify-start" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export naar Excel
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Maandrapport
                </Button>
                <Link to="/add-vehicle">
                  <Button className="w-full justify-start" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Voertuig toevoegen
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;