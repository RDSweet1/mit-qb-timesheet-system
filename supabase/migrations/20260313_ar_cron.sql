-- AR Automation daily pg_cron schedule — 9 AM every day
-- Calls the ar-automation edge function which syncs QB payments then fires dunning stages

DO $$
BEGIN
  -- Remove existing job if present (idempotent)
  PERFORM cron.unschedule('ar-automation')
    FROM cron.job WHERE jobname = 'ar-automation';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ar-automation',
  '0 9 * * *',
  $$SELECT net.http_post(
    url:='https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/ar-automation',
    headers:='{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id$$
);
