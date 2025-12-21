-- Create trips table for individual trip records
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  
  -- Tijden
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  
  -- Locaties
  start_location text,
  start_lat numeric,
  start_lon numeric,
  end_location text,
  end_lat numeric,
  end_lon numeric,
  
  -- Kilometerstanden
  start_odometer_km integer NOT NULL,
  end_odometer_km integer,
  
  -- Type rit
  purpose text DEFAULT 'business' CHECK (purpose IN ('business', 'personal')),
  description text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_manual boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create index for faster queries
CREATE INDEX idx_trips_user_id ON public.trips(user_id);
CREATE INDEX idx_trips_vehicle_id ON public.trips(vehicle_id);
CREATE INDEX idx_trips_started_at ON public.trips(started_at);
CREATE INDEX idx_trips_purpose ON public.trips(purpose);

-- Enable Row Level Security
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own trips" 
ON public.trips 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trips" 
ON public.trips 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trips" 
ON public.trips 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trips" 
ON public.trips 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updating updated_at
CREATE TRIGGER update_trips_updated_at
BEFORE UPDATE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();