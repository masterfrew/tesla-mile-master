-- Create cron job for automatic Tesla sync every 4 hours
SELECT cron.schedule(
  'tesla-sync-all-users',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hqpwepmdxzmuevalzkix.supabase.co/functions/v1/tesla-sync-all',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxcHdlcG1keHptdWV2YWx6a2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjE4MTEsImV4cCI6MjA3MDczNzgxMX0.SbZ96nDglm0cF5XR4MyHSBCyMLYGKif4j6fkrGJ-htM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);