-- Monitoring & Oversight: schedule_config + pg_cron for new functions

-- 1. Add schedule_config rows for new functions
INSERT INTO schedule_config (function_name, display_name, description, schedule_day, schedule_time) VALUES
  ('automation-health-digest', 'Health Digest', 'Daily automation health summary email', 'daily', '07:00'),
  ('midweek-oversight', 'Mid-Week Oversight', 'Check for unsent supplemental reports mid-week', 'wednesday', '10:00'),
  ('sync-customer-emails', 'Sync Customer Emails', 'Populate customer emails from QB Online', 'sunday', '20:00')
ON CONFLICT (function_name) DO NOTHING;

-- 2. Ensure David gets health alerts (report_type='health')
-- Check constraint may not include 'health' yet, so we use 'all' which already covers David
-- The getInternalRecipients('health') function falls back to 'all' recipients

-- 3. pg_cron: Daily health digest at 7:00 AM EST = 12:00 UTC
SELECT cron.schedule(
    'automation-health-digest',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/automation-health-digest',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- 4. pg_cron: Mid-week oversight Wednesday 10:00 AM EST = 15:00 UTC
SELECT cron.schedule(
    'midweek-oversight',
    '0 15 * * 3',
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/midweek-oversight',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- 5. pg_cron: Sync customer emails Sunday 8:00 PM EST = 01:00 UTC Monday
SELECT cron.schedule(
    'sync-customer-emails',
    '0 1 * * 1',
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/sync-customer-emails',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
