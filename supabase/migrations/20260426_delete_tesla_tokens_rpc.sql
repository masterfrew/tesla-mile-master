-- RPC to delete Tesla vault tokens for a user (used on disconnect)
CREATE OR REPLACE FUNCTION public.delete_tesla_tokens(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF auth.uid() != p_user_id AND coalesce(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: cannot delete Tesla tokens for another user';
  END IF;

  DELETE FROM vault.secrets
  WHERE name IN (
    'tesla_access_token_'  || p_user_id::text,
    'tesla_refresh_token_' || p_user_id::text
  );
END;
$$;

-- Grant execute to service role and authenticated users
GRANT EXECUTE ON FUNCTION public.delete_tesla_tokens(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_tesla_tokens(UUID) TO authenticated;
