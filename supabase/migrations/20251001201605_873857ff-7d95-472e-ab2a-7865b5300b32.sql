-- Create table for temporary PKCE state storage
CREATE TABLE IF NOT EXISTS public.oauth_pkce_state (
  nonce TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_pkce_state ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own PKCE states
CREATE POLICY "Users can manage their own PKCE state"
ON public.oauth_pkce_state
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Auto-delete expired states (older than 15 minutes)
CREATE INDEX idx_oauth_pkce_state_created_at ON public.oauth_pkce_state(created_at);

-- Function to clean up old PKCE states
CREATE OR REPLACE FUNCTION public.cleanup_expired_pkce_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.oauth_pkce_state
  WHERE created_at < now() - interval '15 minutes';
END;
$$;