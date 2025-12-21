import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, MapPin, Car, Clock, Navigation } from 'lucide-react';

const tripSchema = z.object({
  vehicle_id: z.string().min(1, 'Selecteer een voertuig'),
  started_at_date: z.string().min(1, 'Startdatum is verplicht'),
  started_at_time: z.string().min(1, 'Starttijd is verplicht'),
  ended_at_date: z.string().optional(),
  ended_at_time: z.string().optional(),
  start_location: z.string().min(1, 'Startlocatie is verplicht'),
  end_location: z.string().min(1, 'Eindlocatie is verplicht'),
  start_odometer_km: z.coerce.number().min(0, 'Kilometerstand moet positief zijn'),
  end_odometer_km: z.coerce.number().min(0, 'Kilometerstand moet positief zijn'),
  purpose: z.enum(['business', 'personal']),
  description: z.string().optional(),
});

type TripFormData = z.infer<typeof tripSchema>;

interface Vehicle {
  id: string;
  display_name: string;
  model: string;
  year: number;
}

interface ManualTripFormProps {
  vehicles: Vehicle[];
  onTripAdded: () => void;
}

export const ManualTripForm: React.FC<ManualTripFormProps> = ({ vehicles, onTripAdded }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TripFormData>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      vehicle_id: vehicles[0]?.id || '',
      started_at_date: new Date().toISOString().split('T')[0],
      started_at_time: '08:00',
      ended_at_date: new Date().toISOString().split('T')[0],
      ended_at_time: '09:00',
      start_location: '',
      end_location: '',
      start_odometer_km: 0,
      end_odometer_km: 0,
      purpose: 'business',
      description: '',
    },
  });

  const onSubmit = async (data: TripFormData) => {
    if (!user) {
      toast.error('Je moet ingelogd zijn');
      return;
    }

    if (data.end_odometer_km < data.start_odometer_km) {
      toast.error('Eind kilometerstand moet hoger zijn dan start');
      return;
    }

    setIsSubmitting(true);

    try {
      const startedAt = new Date(`${data.started_at_date}T${data.started_at_time}:00`);
      const endedAt = data.ended_at_date && data.ended_at_time
        ? new Date(`${data.ended_at_date}T${data.ended_at_time}:00`)
        : null;

      const { error } = await supabase.from('trips').insert({
        user_id: user.id,
        vehicle_id: data.vehicle_id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt?.toISOString() || null,
        start_location: data.start_location,
        end_location: data.end_location,
        start_odometer_km: data.start_odometer_km,
        end_odometer_km: data.end_odometer_km,
        purpose: data.purpose,
        description: data.description || null,
        is_manual: true,
      });

      if (error) throw error;

      toast.success('Rit succesvol toegevoegd!');
      form.reset();
      setOpen(false);
      onTripAdded();
    } catch (error: any) {
      console.error('Error adding trip:', error);
      toast.error(`Fout bij toevoegen: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedDistance = form.watch('end_odometer_km') - form.watch('start_odometer_km');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe rit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Nieuwe rit toevoegen
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Vehicle & Purpose */}
            <div className="grid grid-cols-2 gap-4">
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
                            {vehicle.display_name}
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
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type rit</FormLabel>
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
            </div>

            {/* Start Date/Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Vertrektijd
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="started_at_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="started_at_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* End Date/Time */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Aankomsttijd
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ended_at_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ended_at_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Locations */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-500" />
                      Startlocatie
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="bijv. Kerkstraat 5, Amsterdam" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      Eindlocatie
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="bijv. Stationsplein 1, Utrecht" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Odometer */}
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="start_odometer_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start km-stand</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_odometer_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eind km-stand</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Afstand</Label>
                <div className="h-10 flex items-center px-3 bg-muted rounded-md font-semibold">
                  {calculatedDistance > 0 ? `${calculatedDistance} km` : '—'}
                </div>
              </div>
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschrijving (optioneel)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="bijv. Klantbezoek, vergadering, etc." 
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Opslaan...' : 'Rit opslaan'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
