-- Self-Heal: automated repair loop for failed edge functions
-- Reads inbox for ALERT emails, retries failed functions, sends resolution/escalation email

-- 1. Add schedule_config row
INSERT INTO schedule_config (function_name, display_name, description, schedule_day, schedule_time) VALUES
  ('self-heal', 'Self-Heal', 'Auto-repair loop: reads ALERT emails, retries failed functions, reports results', 'daily', '00:00')
ON CONFLICT (function_name) DO NOTHING;

-- 2. pg_cron: Run every 15 minutes to catch and repair failures quickly
SELECT cron.schedule(
    'self-heal',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/self-heal',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
