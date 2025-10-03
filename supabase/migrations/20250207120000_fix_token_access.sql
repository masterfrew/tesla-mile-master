-- Allow service role access to Tesla token retrieval functions
CREATE OR REPLACE FUNCTION public.get_tesla_access_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF auth.uid() != p_user_id AND coalesce(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'tesla_access_token_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tesla_refresh_token(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF auth.uid() != p_user_id AND coalesce(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized access to Tesla tokens';
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'tesla_refresh_token_' || p_user_id::text
  LIMIT 1;

  RETURN v_token;
END;
$$;
