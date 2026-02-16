-- Replace old monthly-invoices cron with auto-send-invoices
-- Runs on the 1st of each month at 10 AM UTC

SELECT cron.unschedule('monthly-invoices');

SELECT cron.schedule(
    'monthly-auto-invoices',
    '0 10 1 * *',
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/auto-send-invoices',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
