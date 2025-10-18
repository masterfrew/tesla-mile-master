import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Briefcase, User } from 'lucide-react';

interface TripsStatsProps {
  totalBusinessKm: number;
  totalPersonalKm: number;
  totalKm: number;
}

export const TripsStats: React.FC<TripsStatsProps> = ({
  totalBusinessKm,
  totalPersonalKm,
  totalKm,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totaal zakelijk</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalBusinessKm.toLocaleString('nl-NL')} km
          </div>
          <p className="text-xs text-muted-foreground">
            Gefilterde periode
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totaal privé</CardTitle>
          <User className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalPersonalKm.toLocaleString('nl-NL')} km
          </div>
          <p className="text-xs text-muted-foreground">
            Gefilterde periode
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totaal kilometers</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalKm.toLocaleString('nl-NL')} km
          </div>
          <p className="text-xs text-muted-foreground">
            Gefilterde periode
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
