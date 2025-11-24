-- Cleanup function for expired PKCE states (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_pkce_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.oauth_pkce_state
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Function to check if Tesla token is expired
CREATE OR REPLACE FUNCTION public.is_tesla_token_expired(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT tesla_token_expires_at INTO v_expires_at
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Token is expired if expiration is in the past or null
  RETURN v_expires_at IS NULL OR v_expires_at < NOW();
END;
$$;

-- Function to cleanup expired Tesla tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_tesla_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    tesla_access_token = NULL,
    tesla_refresh_token = NULL,
    tesla_token_expires_at = NULL
  WHERE tesla_token_expires_at < NOW();
END;
$$;

-- Function to refresh Tesla token (placeholder for edge function to call)
CREATE OR REPLACE FUNCTION public.mark_token_refresh_needed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;