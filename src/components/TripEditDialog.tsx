import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';

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

interface Trip {
  id: string;
  vehicle_id: string;
  reading_date: string;
  odometer_km: number;
  daily_km: number;
  location_name: string | null;
  metadata: any;
}

interface TripEditDialogProps {
  trip: Trip | null;
  vehicles: Vehicle[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTripUpdated: () => void;
}

export const TripEditDialog: React.FC<TripEditDialogProps> = ({
  trip,
  vehicles,
  open,
  onOpenChange,
  onTripUpdated,
}) => {
  const form = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
  });

  useEffect(() => {
    if (trip) {
      form.reset({
        vehicle_id: trip.vehicle_id,
        reading_date: trip.reading_date,
        odometer_km: trip.odometer_km,
        daily_km: trip.daily_km,
        location_name: trip.location_name || '',
        purpose: trip.metadata?.purpose || 'business',
        description: trip.metadata?.description || '',
      });
    }
  }, [trip, form]);

  const onSubmit = async (data: TripFormData) => {
    if (!trip) return;

    try {
      const { error } = await supabase
        .from('mileage_readings')
        .update({
          vehicle_id: data.vehicle_id,
          reading_date: data.reading_date,
          odometer_km: data.odometer_km,
          daily_km: data.daily_km,
          location_name: data.location_name,
          metadata: {
            purpose: data.purpose,
            description: data.description,
          },
        })
        .eq('id', trip.id);

      if (error) throw error;

      toast.success('Rit succesvol bijgewerkt!');
      onOpenChange(false);
      onTripUpdated();
    } catch (error) {
      console.error('Error updating trip:', error);
      toast.error('Fout bij bijwerken van rit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rit bewerken</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vehicle_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voertuig</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuleren
              </Button>
              <Button type="submit">
                Opslaan
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
