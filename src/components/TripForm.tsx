import React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MapPin, Plus } from 'lucide-react';

const tripSchema = z.object({
  vehicle_id: z.string().min(1, 'Selecteer een voertuig'),
  reading_date: z.string().min(1, 'Selecteer een datum'),
  odometer_km: z.number().min(1, 'Voer kilometerstand in'),
  daily_km: z.number().min(0, 'Voer gereden kilometers in'),
  location_name: z.string().optional(),
  purpose: z.enum(['business', 'personal'], {
    required_error: 'Selecteer het doel van de rit',
  }),
  description: z.string().optional(),
});

type TripFormData = z.infer<typeof tripSchema>;

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface TripFormProps {
  vehicles: Vehicle[];
  onTripAdded: () => void;
}

export const TripForm: React.FC<TripFormProps> = ({ vehicles, onTripAdded }) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      reading_date: new Date().toISOString().split('T')[0],
      daily_km: 0,
      purpose: 'business',
    },
  });

  const onSubmit = async (data: TripFormData) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('mileage_readings')
        .insert({
          user_id: user.id,
          vehicle_id: data.vehicle_id,
          reading_date: data.reading_date,
          odometer_km: data.odometer_km,
          daily_km: data.daily_km,
          location_name: data.location_name,
          // Store purpose and description in a metadata object for now
          metadata: {
            purpose: data.purpose,
            description: data.description,
          },
        });

      if (error) throw error;

      toast.success('Rit succesvol toegevoegd!');
      form.reset({
        reading_date: new Date().toISOString().split('T')[0],
        daily_km: 0,
        purpose: 'business',
      });
      onTripAdded();
    } catch (error) {
      console.error('Error adding trip:', error);
      toast.error('Fout bij toevoegen van rit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Nieuwe rit toevoegen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vehicle_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voertuig</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer voertuig" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.display_name} ({vehicle.model} {vehicle.year})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reading_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Datum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="odometer_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kilometerstand</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="125000"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="daily_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gereden kilometers</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="45"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doel van de rit</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="business">Zakelijk</SelectItem>
                        <SelectItem value="personal">Privé</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Locatie (optioneel)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Amsterdam, Kantoor, etc." 
                          className="pl-10"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschrijving (optioneel)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Klantenbezoek, vergadering, etc."
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Bezig...' : 'Rit toevoegen'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};