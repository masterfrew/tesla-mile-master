-- Add metadata column to mileage_readings table for storing additional trip information
ALTER TABLE public.mileage_readings 
ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;

-- Create an index on metadata for better performance when querying by purpose
CREATE INDEX idx_mileage_readings_metadata_purpose ON public.mileage_readings USING GIN ((metadata->>'purpose'));