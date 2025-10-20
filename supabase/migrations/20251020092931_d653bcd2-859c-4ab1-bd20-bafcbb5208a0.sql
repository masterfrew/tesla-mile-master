-- Fix store_tesla_tokens to use profiles table instead of vault
-- This resolves the "permission denied for function _crypto_aead_det_noncegen" error

CREATE OR REPLACE FUNCTION public.store_tesla_tokens(
  p_user_id uuid, 
  p_access_token text, 
  p_refresh_token text, 
  p_expires_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update tokens directly in profiles table
  UPDATE public.profiles
  SET 
    tesla_access_token = p_access_token,
    tesla_refresh_token = p_refresh_token,
    tesla_token_expires_at = p_expires_at,
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- If profile doesn't exist yet, create it
  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      user_id, 
      tesla_access_token, 
      tesla_refresh_token, 
      tesla_token_expires_at
    )
    VALUES (
      p_user_id, 
      p_access_token, 
      p_refresh_token, 
      p_expires_at
    );
  END IF;
END;
$function$;

-- Update get_tesla_access_token to read from profiles
CREATE OR REPLACE FUNCTION public.get_tesla_access_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  -- Only allow users to retrieve their own tokens
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT tesla_access_token INTO v_token
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  RETURN v_token;
END;
$function$;

-- Update get_tesla_refresh_token to read from profiles
CREATE OR REPLACE FUNCTION public.get_tesla_refresh_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  -- Only allow users to retrieve their own tokens
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT tesla_refresh_token INTO v_token
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  RETURN v_token;
END;
$function$;