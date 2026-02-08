-- Phase C: pg_cron jobs for follow-up reminders and auto-accept
-- Follow-up reminders: 9:00 AM weekdays (sends 48h/24h/final notice emails)
-- Auto-accept: 5:00 PM weekdays (auto-accepts reports at Day 3 COB)

-- ================================================
-- 1. Follow-Up Reminders — 9:00 AM weekdays
-- ================================================
SELECT cron.schedule(
    'follow-up-reminders',
    '0 14 * * 1-5',  -- 9:00 AM EST = 14:00 UTC
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/follow-up-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ================================================
-- 2. Auto-Accept — 5:00 PM weekdays
-- ================================================
SELECT cron.schedule(
    'auto-accept',
    '0 22 * * 1-5',  -- 5:00 PM EST = 22:00 UTC
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/auto-accept',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
