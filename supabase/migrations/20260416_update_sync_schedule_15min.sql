-- Update Tesla sync cron job from hourly to every 15 minutes
-- This enables near-real-time trip tracking instead of max 1-hour delay

-- Remove old hourly job
select cron.unschedule('tesla-sync-all');

-- Reschedule to run every 15 minutes
select cron.schedule(
  'tesla-sync-all',
  '*/15 * * * *',
  $$
    select
      net.http_post(
          url:='https://hqpwepmdxzmuevalzkix.supabase.co/functions/v1/tesla-sync-all',
          headers:='{"Content-Type": "application/json", "x-cron-secret": "YOUR_CRON_SECRET_HERE"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
  $$
);
