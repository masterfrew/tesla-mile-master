-- Fix: Move the 264km from 11/12 to 10/12 (the day it was actually driven)
UPDATE mileage_readings 
SET daily_km = 264, 
    metadata = jsonb_build_object('end_odometer_km', 88671, 'corrected', true, 'correction_date', now())
WHERE reading_date = '2025-12-10' 
AND vehicle_id IN (SELECT id FROM vehicles WHERE display_name = 'Frew');

UPDATE mileage_readings 
SET daily_km = 0
WHERE reading_date = '2025-12-11' 
AND vehicle_id IN (SELECT id FROM vehicles WHERE display_name = 'Frew');

-- Add unique constraint for UPSERT to work properly
ALTER TABLE mileage_readings 
ADD CONSTRAINT mileage_readings_vehicle_date_unique 
UNIQUE (vehicle_id, reading_date);