-- Add unique constraint on user_id and tesla_vehicle_id for upsert operations
ALTER TABLE public.vehicles
ADD CONSTRAINT vehicles_user_id_tesla_vehicle_id_key 
UNIQUE (user_id, tesla_vehicle_id);