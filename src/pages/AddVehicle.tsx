import React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Plus, FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

const AddVehicle = () => {
  const { user } = useAuth();
  const [vehicleName, setVehicleName] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .insert({
          user_id: user.id,
          display_name: vehicleName,
          model: model,
          year: parseInt(year),
          vin: vin,
          tesla_vehicle_id: Math.floor(Math.random() * 1000000), // Mock ID for now
          is_active: true,
        });

      if (error) throw error;

      toast.success('Voertuig succesvol toegevoegd!');
      
      // Reset form
      setVehicleName('');
      setModel('');
      setYear('');
      setVin('');
    } catch (error) {
      console.error('Error adding vehicle:', error);
      toast.error('Fout bij toevoegen van voertuig');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Voertuig toevoegen</h1>
            <p className="text-muted-foreground">
              Voeg een nieuw voertuig toe voor kilometerregistratie
            </p>
          </div>
          <Link to="/">
            <Button variant="outline">Terug naar dashboard</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Voertuig details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Naam voertuig</label>
                  <Input
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    placeholder="Mijn Tesla Model 3"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <Select value={model} onValueChange={setModel} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Model S">Model S</SelectItem>
                      <SelectItem value="Model 3">Model 3</SelectItem>
                      <SelectItem value="Model X">Model X</SelectItem>
                      <SelectItem value="Model Y">Model Y</SelectItem>
                      <SelectItem value="Cybertruck">Cybertruck</SelectItem>
                      <SelectItem value="Andere">Andere</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Bouwjaar</label>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2023"
                    min="2008"
                    max={new Date().getFullYear() + 1}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">VIN (laatste 6 cijfers)</label>
                  <Input
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    placeholder="123456"
                    maxLength={17}
                    required
                  />
                </div>
              </div>

              <div className="pt-4">
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? 'Bezig...' : 'Voertuig toevoegen'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Alternatief: Import via Excel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Heb je meerdere voertuigen? Upload een Excel-bestand met voertuiggegevens.
            </p>
            <Button variant="outline" disabled>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel importeren (binnenkort beschikbaar)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AddVehicle;