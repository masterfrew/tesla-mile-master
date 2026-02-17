-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Remove existing job if present
select cron.unschedule('tesla-sync-all');

-- Schedule the job to run every hour at minute 0
-- Replace PROJECT_REF with your actual project reference (hqpwepmdxzmuevalzkix)
-- Replace CRON_SECRET with your actual secret (from .env or Supabase Dashboard)
select cron.schedule(
  'tesla-sync-all',
  '0 * * * *',
  $$
    select
      net.http_post(
          url:='https://hqpwepmdxzmuevalzkix.supabase.co/functions/v1/tesla-sync-all',
          headers:='{"Content-Type": "application/json", "x-cron-secret": "YOUR_CRON_SECRET_HERE"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
  $$
);
