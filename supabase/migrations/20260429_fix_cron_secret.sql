-- Fix cron job: reschedule with correct CRON_SECRET
-- Removes the placeholder secret and uses the real value

select cron.unschedule('tesla-sync-all');

select cron.schedule(
  'tesla-sync-all',
  '*/15 * * * *',
  $$
    select
      net.http_post(
          url:='https://hqpwepmdxzmuevalzkix.supabase.co/functions/v1/tesla-sync-all',
          headers:='{"Content-Type": "application/json", "x-cron-secret": "9c4c889089bd089a9d21c7777fe210b81ca6c9a386c6685243b45ae1d62c1a7d"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
  $$
);
