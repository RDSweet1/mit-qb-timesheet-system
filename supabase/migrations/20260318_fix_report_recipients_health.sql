-- 1. Fix report_recipients.report_type CHECK constraint to include 'health'
ALTER TABLE report_recipients DROP CONSTRAINT IF EXISTS report_recipients_report_type_check;
ALTER TABLE report_recipients ADD CONSTRAINT report_recipients_report_type_check
  CHECK (report_type IN ('profitability', 'reconciliation', 'health', 'all'));

-- 2. Register AR functions in schedule_config
INSERT INTO schedule_config (function_name, display_name, description, schedule_day, schedule_time) VALUES
  ('ar-automation', 'AR Automation', 'Daily automated AR collection sequence', 'daily', '09:00'),
  ('ar-sync-payments', 'AR Sync Payments', 'Sync QB payment data for AR tracking', 'daily', '08:00'),
  ('ar-sync-emails', 'AR Sync Emails', 'Sync customer email replies from inbox', 'daily', '08:30')
ON CONFLICT (function_name) DO NOTHING;

-- 3. Schedule daily cleanup of function_metrics rows older than 30 days (runs at 5:00 UTC)
SELECT cron.schedule(
    'function-metrics-cleanup',
    '0 5 * * *',
    $$DELETE FROM function_metrics WHERE started_at < now() - interval '30 days';$$
);
