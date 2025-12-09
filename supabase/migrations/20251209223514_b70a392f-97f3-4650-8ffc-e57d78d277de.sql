-- Phase 2: GDPR Compliance & Audit Logging

-- 1. Add DELETE policy for vehicles table (GDPR compliance)
CREATE POLICY "Users can delete their own vehicles" 
ON public.vehicles 
FOR DELETE 
USING (auth.uid() = user_id);

-- 2. Create audit_logs table for tracking important events
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow insert from edge functions (service role) - no user restriction for inserts
CREATE POLICY "Service can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (true);

-- 3. Create index for faster audit log queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- 4. Add vehicle_sync_status table to track sync attempts and failures
CREATE TABLE public.vehicle_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_sync_attempt timestamptz,
  last_successful_sync timestamptz,
  consecutive_failures integer DEFAULT 0,
  last_error text,
  is_offline boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id)
);

-- Enable RLS on vehicle_sync_status
ALTER TABLE public.vehicle_sync_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own sync status
CREATE POLICY "Users can view their own vehicle sync status" 
ON public.vehicle_sync_status 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can update their own sync status
CREATE POLICY "Users can update their own vehicle sync status" 
ON public.vehicle_sync_status 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Allow inserts for authenticated users
CREATE POLICY "Users can insert their own vehicle sync status" 
ON public.vehicle_sync_status 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger to update updated_at
CREATE TRIGGER update_vehicle_sync_status_updated_at
BEFORE UPDATE ON public.vehicle_sync_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Create function to log audit events (for use in edge functions)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;