import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, 
  Users, 
  Car, 
  Activity, 
  BarChart3,
  RefreshCw,
  MoreVertical,
  Shield,
  Zap,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface AdminStats {
  total_users: number;
  users_with_tesla: number;
  total_vehicles: number;
  total_mileage_readings: number;
  active_today: number;
}

interface UserData {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  subscription_tier: string | null;
  has_tesla_connected: boolean;
  created_at: string;
  vehicle_count: number;
}

const Admin: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast.error('Geen toegang tot admin dashboard');
      navigate('/');
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch admin stats
      const { data: statsData, error: statsError } = await supabase.rpc('get_admin_stats');
      if (statsError) throw statsError;
      if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }

      // Fetch all users
      const { data: usersData, error: usersError } = await supabase.rpc('get_all_users');
      if (usersError) throw usersError;
      setUsers(usersData || []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Kon admin data niet laden');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Geen actieve sessie');
        return;
      }

      const { data, error } = await supabase.functions.invoke('tesla-sync-all', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Sync error:', error);
        toast.error('Sync mislukt');
        return;
      }

      toast.success(`Sync voltooid: ${data?.synced_vehicles || 0} voertuigen gesynchroniseerd`);
      await fetchData();
    } catch (error) {
      console.error('Sync exception:', error);
      toast.error('Er ging iets mis bij de sync');
    } finally {
      setSyncing(false);
    }
  };

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span>Laden...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="bg-primary p-2 rounded-lg">
                  <Shield className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Admin Dashboard</h1>
                  <p className="text-sm text-muted-foreground">Gebruikersbeheer</p>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleManualSync} 
              disabled={syncing}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchroniseren...' : 'Handmatige Sync'}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totaal Gebruikers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tesla Gekoppeld</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.users_with_tesla || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.total_users ? Math.round((stats.users_with_tesla / stats.total_users) * 100) : 0}% van totaal
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Voertuigen</CardTitle>
              <Car className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_vehicles || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Kilometerstanden</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_mileage_readings?.toLocaleString('nl-NL') || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Actief Vandaag</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.active_today || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Alle Gebruikers</CardTitle>
            <CardDescription>
              Overzicht van alle geregistreerde gebruikers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Geen gebruikers gevonden</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gebruiker</TableHead>
                      <TableHead>Bedrijf</TableHead>
                      <TableHead>Tesla</TableHead>
                      <TableHead>Voertuigen</TableHead>
                      <TableHead>Abonnement</TableHead>
                      <TableHead>Aangemeld</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((userData) => (
                      <TableRow key={userData.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {userData.first_name || userData.last_name 
                                ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim()
                                : 'Onbekend'}
                            </p>
                            <p className="text-sm text-muted-foreground">{userData.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {userData.company_name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {userData.has_tesla_connected ? (
                            <Badge variant="default" className="bg-green-600">Gekoppeld</Badge>
                          ) : (
                            <Badge variant="secondary">Niet gekoppeld</Badge>
                          )}
                        </TableCell>
                        <TableCell>{userData.vehicle_count}</TableCell>
                        <TableCell>
                          <Badge variant={userData.subscription_tier === 'premium' ? 'default' : 'secondary'}>
                            {userData.subscription_tier || 'basic'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(userData.created_at), 'd MMM yyyy', { locale: nl })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem disabled>
                                <Calendar className="h-4 w-4 mr-2" />
                                Bekijk details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
