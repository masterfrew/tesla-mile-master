-- Use Supabase Vault for secure token storage instead of raw pgsodium
-- Vault provides a simpler API with proper permissions

-- Create a vault secret for storing Tesla tokens (one per user)
-- We'll store tokens in a separate encrypted table

-- Drop the previously added columns if they exist (from failed migration attempt)
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS tesla_access_token_encrypted,
DROP COLUMN IF EXISTS tesla_refresh_token_encrypted,
DROP COLUMN IF EXISTS tesla_token_key_id;

-- Create a table to store encrypted tokens using application-level encryption
-- The tokens will be encrypted/decrypted in the edge functions using a master key
CREATE TABLE IF NOT EXISTS public.encrypted_tesla_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamp with time zone,
  encryption_version integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.encrypted_tesla_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
CREATE POLICY "Service role can manage encrypted tokens"
ON public.encrypted_tesla_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Update function to store tokens (for edge functions using service role)
CREATE OR REPLACE FUNCTION public.store_encrypted_tesla_tokens(
  p_user_id uuid,
  p_encrypted_access_token text,
  p_encrypted_refresh_token text,
  p_expires_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.encrypted_tesla_tokens (
    user_id,
    encrypted_access_token,
    encrypted_refresh_token,
    token_expires_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_encrypted_access_token,
    p_encrypted_refresh_token,
    p_expires_at,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_access_token = p_encrypted_access_token,
    encrypted_refresh_token = p_encrypted_refresh_token,
    token_expires_at = p_expires_at,
    updated_at = now();
    
  -- Also update the expiration in profiles for quick checks
  UPDATE public.profiles
  SET 
    tesla_token_expires_at = p_expires_at,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;

-- Function to get encrypted tokens (for edge functions)
CREATE OR REPLACE FUNCTION public.get_encrypted_tesla_tokens(p_user_id uuid)
RETURNS TABLE(
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.encrypted_access_token,
    t.encrypted_refresh_token,
    t.token_expires_at
  FROM public.encrypted_tesla_tokens t
  WHERE t.user_id = p_user_id;
END;
$function$;

-- Function to clear encrypted tokens (for disconnect)
CREATE OR REPLACE FUNCTION public.clear_encrypted_tesla_tokens(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.encrypted_tesla_tokens WHERE user_id = p_user_id;
  
  UPDATE public.profiles
  SET 
    tesla_access_token = NULL,
    tesla_refresh_token = NULL,
    tesla_token_expires_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;