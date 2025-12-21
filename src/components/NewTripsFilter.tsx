import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Filter, X, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface NewTripsFilterProps {
  vehicles: Vehicle[];
  selectedVehicle: string;
  selectedPurpose: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  onVehicleChange: (value: string) => void;
  onPurposeChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onReset: () => void;
  activeFiltersCount: number;
}

export const NewTripsFilter: React.FC<NewTripsFilterProps> = ({
  vehicles,
  selectedVehicle,
  selectedPurpose,
  startDate,
  endDate,
  startTime,
  endTime,
  onVehicleChange,
  onPurposeChange,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onReset,
  activeFiltersCount,
}) => {
  const applyWorkHours = () => {
    onStartTimeChange('07:00');
    onEndTimeChange('19:00');
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Filters</h3>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFiltersCount} actief
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={applyWorkHours}
                className="text-xs"
              >
                <Clock className="h-3 w-3 mr-1" />
                Werktijden (7-19)
              </Button>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onReset}>
                  <X className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Van datum</Label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">Tot datum</Label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Time Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Tijdfilter
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => onStartTimeChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Van"
                />
                <span className="text-muted-foreground">-</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => onEndTimeChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Tot"
                />
              </div>
            </div>

            {/* Vehicle Filter */}
            <div className="space-y-2">
              <Label htmlFor="vehicle-filter">Voertuig</Label>
              <Select value={selectedVehicle} onValueChange={onVehicleChange}>
                <SelectTrigger id="vehicle-filter">
                  <SelectValue placeholder="Alle voertuigen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle voertuigen</SelectItem>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Purpose Filter */}
            <div className="space-y-2">
              <Label htmlFor="purpose-filter">Type rit</Label>
              <Select value={selectedPurpose} onValueChange={onPurposeChange}>
                <SelectTrigger id="purpose-filter">
                  <SelectValue placeholder="Alle ritten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle ritten</SelectItem>
                  <SelectItem value="business">Zakelijk</SelectItem>
                  <SelectItem value="personal">Privé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
