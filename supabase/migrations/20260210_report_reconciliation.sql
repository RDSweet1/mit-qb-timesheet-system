-- Report Period Tracking & Reconciliation
-- Tracks every customer/week combination: sent, missed, or no time
-- Enables late entry detection and Monday reconciliation emails
-- Created: 2026-02-10

-- ================================================
-- 1. REPORT PERIODS TABLE
-- One row per customer per week
-- ================================================
CREATE TABLE IF NOT EXISTS report_periods (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  qb_customer_id TEXT NOT NULL,
  customer_name TEXT,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'supplemental_sent', 'no_time')),
  total_hours NUMERIC(10,2) DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  late_entry_count INTEGER DEFAULT 0,
  late_entry_hours NUMERIC(10,2) DEFAULT 0,
  sent_at TIMESTAMPTZ,
  supplemental_sent_at TIMESTAMPTZ,
  email_log_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (qb_customer_id, week_start)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_report_periods_week
  ON report_periods(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_periods_status
  ON report_periods(status, week_start);
CREATE INDEX IF NOT EXISTS idx_report_periods_customer
  ON report_periods(qb_customer_id, week_start DESC);

-- Enable RLS
ALTER TABLE report_periods ENABLE ROW LEVEL SECURITY;

-- Anon can read (frontend needs this)
DROP POLICY IF EXISTS "Anon users can read report_periods" ON report_periods;
CREATE POLICY "Anon users can read report_periods" ON report_periods
  FOR SELECT TO anon USING (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on report_periods" ON report_periods;
CREATE POLICY "Service role full access on report_periods" ON report_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE report_periods IS 'Tracks report status per customer per week: sent, missed, no_time, supplemental';
COMMENT ON COLUMN report_periods.late_entry_count IS 'Number of time entries synced after the report was sent';
COMMENT ON COLUMN report_periods.late_entry_hours IS 'Total hours of late entries synced after the report was sent';

-- ================================================
-- 2. RECONCILIATION LOG TABLE
-- Audit trail for each Monday reconciliation run
-- ================================================
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id BIGSERIAL PRIMARY KEY,
  week_analyzed DATE NOT NULL,
  total_customers INTEGER DEFAULT 0,
  reports_sent INTEGER DEFAULT 0,
  reports_missed INTEGER DEFAULT 0,
  no_time_customers INTEGER DEFAULT 0,
  late_entry_customers INTEGER DEFAULT 0,
  missed_reports JSONB DEFAULT '[]'::jsonb,
  late_entries JSONB DEFAULT '[]'::jsonb,
  email_sent_to TEXT,
  email_sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'no_action_needed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_log_week
  ON reconciliation_log(week_analyzed DESC);

-- Enable RLS
ALTER TABLE reconciliation_log ENABLE ROW LEVEL SECURITY;

-- Anon can read
DROP POLICY IF EXISTS "Anon users can read reconciliation_log" ON reconciliation_log;
CREATE POLICY "Anon users can read reconciliation_log" ON reconciliation_log
  FOR SELECT TO anon USING (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on reconciliation_log" ON reconciliation_log;
CREATE POLICY "Service role full access on reconciliation_log" ON reconciliation_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE reconciliation_log IS 'Audit trail for Monday reconciliation runs: missed reports, late entries, email status';

-- ================================================
-- 3. ALTER EMAIL_LOG
-- Add FK to report_periods and supplemental flag
-- ================================================
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS report_period_id BIGINT REFERENCES report_periods(id),
  ADD COLUMN IF NOT EXISTS is_supplemental BOOLEAN DEFAULT false;

-- ================================================
-- 4. PG_CRON JOB: Weekly Reconciliation
-- Runs at 9:30 AM Monday (after weekly reports at 9:00 AM)
-- ================================================
SELECT cron.schedule(
    'weekly-reconciliation',
    '30 9 * * 1',  -- 9:30 AM every Monday
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/report-reconciliation',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
