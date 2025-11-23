-- Check current RLS status and policies for oauth_pkce_state
-- The issue is that edge functions use the SERVICE_ROLE_KEY which bypasses RLS,
-- but let's ensure the table is properly configured

-- First, let's check if there's a TTL or cleanup that's too aggressive
-- Drop any existing cleanup that might be deleting states too quickly
DROP TRIGGER IF EXISTS cleanup_expired_pkce_states_trigger ON oauth_pkce_state;

-- Recreate the cleanup trigger with a more reasonable 1 hour TTL
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_pkce_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clean up states older than 1 hour (increased from 15 minutes)
  DELETE FROM public.oauth_pkce_state
  WHERE created_at < NOW() - INTERVAL '1 hour';
  
  RETURN NEW;
END;
$$;

-- Trigger cleanup on every insert to keep table small
CREATE TRIGGER cleanup_expired_pkce_states_trigger
  BEFORE INSERT ON oauth_pkce_state
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_cleanup_expired_pkce_states();

-- Also update the manual cleanup function to match
CREATE OR REPLACE FUNCTION public.cleanup_expired_pkce_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.oauth_pkce_state
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;