-- Schedule configuration table for automation control
-- Replaces hardcoded pg_cron schedules with user-configurable settings

CREATE TABLE schedule_config (
  id SERIAL PRIMARY KEY,
  function_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_paused BOOLEAN DEFAULT false,
  schedule_day TEXT DEFAULT 'monday',        -- monday/tuesday/.../weekdays/daily
  schedule_time TIME DEFAULT '09:00',        -- local time (EST)
  timezone TEXT DEFAULT 'America/New_York',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,                      -- success/error/skipped_paused
  paused_by TEXT,
  paused_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with current hardcoded schedules
INSERT INTO schedule_config (function_name, display_name, description, schedule_day, schedule_time) VALUES
  ('send-reminder', 'Weekly Reports', 'Send weekly time reports to customers', 'monday', '09:00'),
  ('follow-up-reminders', 'Follow-Up Reminders', '3-day reminder sequence for unreviewed reports', 'weekdays', '09:00'),
  ('auto-accept', 'Auto-Accept', 'Auto-accept reports after 3 business days', 'weekdays', '17:00'),
  ('report-reconciliation', 'Reconciliation', 'Monday morning reconciliation check', 'monday', '09:30'),
  ('weekly-profitability-report', 'Profitability Report', 'Weekly profitability snapshot and email', 'monday', '10:00');

-- RLS: anon can read and update, service_role has full access
ALTER TABLE schedule_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_schedule" ON schedule_config FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_schedule" ON schedule_config FOR UPDATE TO anon USING (true);
