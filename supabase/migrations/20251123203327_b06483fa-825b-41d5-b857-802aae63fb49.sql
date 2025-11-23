-- Simple reset of oauth_pkce_state table
DROP TABLE IF EXISTS oauth_pkce_state CASCADE;

CREATE TABLE oauth_pkce_state (
  nonce TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_oauth_pkce_state_user_id ON oauth_pkce_state(user_id);
CREATE INDEX idx_oauth_pkce_state_created_at ON oauth_pkce_state(created_at);

-- RLS
ALTER TABLE oauth_pkce_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own PKCE state"
  ON oauth_pkce_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cleanup function (manual)
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