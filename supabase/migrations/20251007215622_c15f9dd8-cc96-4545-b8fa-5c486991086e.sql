-- Add columns to store Tesla tokens directly in profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tesla_access_token TEXT,
ADD COLUMN IF NOT EXISTS tesla_refresh_token TEXT;

-- Add comment explaining this is a workaround
COMMENT ON COLUMN public.profiles.tesla_access_token IS 'Tesla OAuth access token - stored temporarily until vault encryption is working';
COMMENT ON COLUMN public.profiles.tesla_refresh_token IS 'Tesla OAuth refresh token - stored temporarily until vault encryption is working';