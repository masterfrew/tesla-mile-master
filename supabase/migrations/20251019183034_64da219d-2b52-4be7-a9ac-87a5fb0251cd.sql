-- Drop the old problematic function
DROP FUNCTION IF EXISTS public.store_tesla_tokens(uuid, text, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_tesla_access_token(uuid);
DROP FUNCTION IF EXISTS public.get_tesla_refresh_token(uuid);

-- Create simplified token storage function that works with vault
CREATE OR REPLACE FUNCTION public.store_tesla_tokens(
  p_user_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  -- Delete existing secrets for this user
  DELETE FROM vault.secrets 
  WHERE name IN (
    'tesla_access_' || p_user_id::text,
    'tesla_refresh_' || p_user_id::text
  );

  -- Insert new encrypted tokens directly into vault.secrets
  -- The vault automatically handles encryption
  INSERT INTO vault.secrets (name, secret)
  VALUES 
    ('tesla_access_' || p_user_id::text, p_access_token),
    ('tesla_refresh_' || p_user_id::text, p_refresh_token);

  -- Update the expiry timestamp in profiles (not sensitive)
  UPDATE public.profiles
  SET 
    tesla_token_expires_at = p_expires_at,
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- If profile doesn't exist yet, create it
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, tesla_token_expires_at)
    VALUES (p_user_id, p_expires_at)
    ON CONFLICT (user_id) DO UPDATE
    SET tesla_token_expires_at = p_expires_at,
        updated_at = now();
  END IF;
END;
$$;

-- Create function to retrieve access token
CREATE OR REPLACE FUNCTION public.get_tesla_access_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Only allow users to retrieve their own tokens
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'tesla_access_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;

-- Create function to retrieve refresh token
CREATE OR REPLACE FUNCTION public.get_tesla_refresh_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Only allow users to retrieve their own tokens
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'tesla_refresh_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;