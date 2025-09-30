-- Security Fix: Migrate Tesla tokens to encrypted vault storage
-- This removes plaintext tokens from the profiles table and uses pgsodium encryption

-- First, ensure pgsodium extension is enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create a secure function to store encrypted Tesla tokens
CREATE OR REPLACE FUNCTION public.store_tesla_tokens(
  p_user_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
BEGIN
  -- Get or create a key for this user's tokens
  SELECT id INTO v_key_id
  FROM pgsodium.valid_key
  WHERE name = 'tesla_tokens_' || p_user_id::text
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    v_key_id := pgsodium.create_key(name := 'tesla_tokens_' || p_user_id::text);
  END IF;

  -- Store encrypted tokens in vault
  -- Delete existing tokens first
  DELETE FROM vault.secrets 
  WHERE name IN (
    'tesla_access_token_' || p_user_id::text,
    'tesla_refresh_token_' || p_user_id::text
  );

  -- Insert new encrypted tokens
  INSERT INTO vault.secrets (name, secret, key_id)
  VALUES 
    ('tesla_access_token_' || p_user_id::text, p_access_token, v_key_id),
    ('tesla_refresh_token_' || p_user_id::text, p_refresh_token, v_key_id);

  -- Update the expiry timestamp in profiles (not sensitive)
  UPDATE public.profiles
  SET tesla_token_expires_at = p_expires_at,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Create a secure function to retrieve Tesla access token
CREATE OR REPLACE FUNCTION public.get_tesla_access_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  WHERE name = 'tesla_access_token_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;

-- Create a secure function to retrieve Tesla refresh token
CREATE OR REPLACE FUNCTION public.get_tesla_refresh_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  WHERE name = 'tesla_refresh_token_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;

-- Migrate existing plaintext tokens to vault (if any exist)
DO $$
DECLARE
  profile_record RECORD;
BEGIN
  FOR profile_record IN 
    SELECT user_id, tesla_access_token, tesla_refresh_token, tesla_token_expires_at
    FROM public.profiles
    WHERE tesla_access_token IS NOT NULL OR tesla_refresh_token IS NOT NULL
  LOOP
    -- Only migrate if we have both tokens
    IF profile_record.tesla_access_token IS NOT NULL AND profile_record.tesla_refresh_token IS NOT NULL THEN
      PERFORM public.store_tesla_tokens(
        profile_record.user_id,
        profile_record.tesla_access_token,
        profile_record.tesla_refresh_token,
        profile_record.tesla_token_expires_at
      );
    END IF;
  END LOOP;
END;
$$;

-- Remove the plaintext token columns from profiles table
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS tesla_access_token,
  DROP COLUMN IF EXISTS tesla_refresh_token;

-- Add comment to document the security improvement
COMMENT ON FUNCTION public.store_tesla_tokens IS 'Securely stores Tesla API tokens using pgsodium encryption in the vault schema. Tokens are encrypted at rest and only accessible through this function.';
COMMENT ON FUNCTION public.get_tesla_access_token IS 'Retrieves the encrypted Tesla access token for the authenticated user. Enforces user-level access control.';
COMMENT ON FUNCTION public.get_tesla_refresh_token IS 'Retrieves the encrypted Tesla refresh token for the authenticated user. Enforces user-level access control.';