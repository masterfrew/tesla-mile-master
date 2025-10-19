-- Add UPDATE and DELETE policies for mileage_readings
-- Users should be able to update and delete their own mileage readings

CREATE POLICY "Users can update their own mileage readings"
ON public.mileage_readings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mileage readings"
ON public.mileage_readings
FOR DELETE
USING (auth.uid() = user_id);