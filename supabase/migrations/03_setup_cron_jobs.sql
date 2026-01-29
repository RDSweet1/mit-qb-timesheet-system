-- ================================================
-- PRODUCTION AUTOMATION SETUP
-- Configure scheduled tasks using pg_cron
-- ================================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ================================================
-- 1. DAILY TIME ENTRY SYNC
-- Runs every day at 8:00 AM EST
-- ================================================
SELECT cron.schedule(
    'daily-time-sync',
    '0 8 * * *',  -- 8 AM daily
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := jsonb_build_object(
            'action', 'sync',
            'days_back', 7
        )
    );
    $$
);

-- ================================================
-- 2. WEEKLY REPORTS
-- Runs every Monday at 9:00 AM EST
-- ================================================
SELECT cron.schedule(
    'weekly-reports',
    '0 9 * * 1',  -- 9 AM every Monday
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/send-reminder',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := jsonb_build_object(
            'week_start', (CURRENT_DATE - INTERVAL '7 days')::text,
            'week_end', (CURRENT_DATE - INTERVAL '1 day')::text
        )
    );
    $$
);

-- ================================================
-- 3. MONTHLY INVOICES
-- Runs on the 1st of each month at 10:00 AM EST
-- ================================================
SELECT cron.schedule(
    'monthly-invoices',
    '0 10 1 * *',  -- 10 AM on the 1st of each month
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/create-invoices',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := jsonb_build_object(
            'month', to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM'),
            'auto_send', false
        )
    );
    $$
);

-- ================================================
-- 4. TOKEN REFRESH
-- Runs every 30 minutes to refresh QuickBooks OAuth tokens
-- ================================================
SELECT cron.schedule(
    'refresh-qb-tokens',
    '*/30 * * * *',  -- Every 30 minutes
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/refresh-tokens',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ================================================
-- 5. CLEANUP OLD LOGS
-- Runs daily at 2:00 AM to clean up old logs
-- ================================================
SELECT cron.schedule(
    'cleanup-old-logs',
    '0 2 * * *',  -- 2 AM daily
    $$
    DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL '1 year';
    DELETE FROM sync_logs WHERE created_at < NOW() - INTERVAL '90 days';
    $$
);

-- ================================================
-- VIEW SCHEDULED JOBS
-- Query to see all configured cron jobs
-- ================================================
-- To view all cron jobs, run:
-- SELECT * FROM cron.job;

-- To unschedule a job:
-- SELECT cron.unschedule('job-name');

-- To view job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 100;

-- ================================================
-- MONITORING TABLE
-- Track automation execution
-- ================================================
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'running')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access" ON automation_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Create index for faster queries
CREATE INDEX idx_automation_logs_job_name ON automation_logs(job_name);
CREATE INDEX idx_automation_logs_created_at ON automation_logs(created_at DESC);

-- ================================================
-- HELPER FUNCTION: Log automation execution
-- ================================================
CREATE OR REPLACE FUNCTION log_automation(
    p_job_name TEXT,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL,
    p_result JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO automation_logs (job_name, status, completed_at, error_message, result)
    VALUES (p_job_name, p_status, NOW(), p_error_message, p_result)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON EXTENSION pg_cron IS 'Production automation using PostgreSQL cron jobs';
COMMENT ON TABLE automation_logs IS 'Logs for automated job execution and monitoring';
COMMENT ON FUNCTION log_automation IS 'Helper function to log automation execution results';
