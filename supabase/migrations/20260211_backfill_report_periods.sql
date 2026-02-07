-- Backfill report_periods from existing email_log rows
-- One-time migration to populate historical data
-- Created: 2026-02-10

-- Insert report_periods from email_log entries
-- Each email_log row with email_type='weekly_reminder' becomes a 'sent' report_period
INSERT INTO report_periods (
  customer_id,
  qb_customer_id,
  customer_name,
  week_start,
  week_end,
  status,
  total_hours,
  entry_count,
  sent_at,
  email_log_id,
  created_at,
  updated_at
)
SELECT
  el.customer_id::text,
  c.qb_customer_id,
  c.display_name,
  el.week_start,
  el.week_end,
  'sent',
  COALESCE(el.total_hours, 0),
  COALESCE((
    SELECT COUNT(*)
    FROM time_entries te
    WHERE te.qb_customer_id = c.qb_customer_id
      AND te.txn_date >= el.week_start
      AND te.txn_date <= el.week_end
      AND te.billable_status = 'Billable'
  ), 0),
  NOW(),
  el.id,
  NOW(),
  NOW()
FROM email_log el
JOIN customers c ON c.id = el.customer_id
WHERE el.email_type = 'weekly_reminder'
  AND el.week_start IS NOT NULL
ON CONFLICT (qb_customer_id, week_start) DO NOTHING;

-- Link existing email_log rows to their report_periods
UPDATE email_log el
SET report_period_id = rp.id
FROM report_periods rp
WHERE el.email_type = 'weekly_reminder'
  AND el.week_start IS NOT NULL
  AND rp.email_log_id = el.id
  AND el.report_period_id IS NULL;
