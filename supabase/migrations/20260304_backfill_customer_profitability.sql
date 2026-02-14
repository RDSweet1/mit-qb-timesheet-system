-- Backfill customer_profitability from existing time_entries data
-- This computes per-customer per-week profitability for all weeks
-- that have profitability_snapshots but no customer_profitability rows.

INSERT INTO customer_profitability (
  week_start, week_end, qb_customer_id, customer_name,
  total_hours, billable_hours, overhead_hours,
  billable_revenue, labor_cost, margin, margin_percent,
  entry_count, unbilled_hours
)
SELECT
  te.week_start,
  te.week_end,
  te.qb_customer_id,
  COALESCE(c.display_name, te.qb_customer_id) AS customer_name,
  SUM(te.hours + te.minutes / 60.0) AS total_hours,
  SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
      THEN te.hours + te.minutes / 60.0 ELSE 0 END) AS billable_hours,
  SUM(CASE WHEN COALESCE(c.is_internal, false) OR si.overhead_category IS NOT NULL
      THEN te.hours + te.minutes / 60.0 ELSE 0 END) AS overhead_hours,
  SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
      THEN (te.hours + te.minutes / 60.0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS billable_revenue,
  SUM((te.hours + te.minutes / 60.0) * COALESCE(ecr.fully_loaded_rate, 0)) AS labor_cost,
  SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
      THEN (te.hours + te.minutes / 60.0) * COALESCE(si.unit_price, 0) ELSE 0 END)
    - SUM((te.hours + te.minutes / 60.0) * COALESCE(ecr.fully_loaded_rate, 0)) AS margin,
  CASE WHEN SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
      THEN (te.hours + te.minutes / 60.0) * COALESCE(si.unit_price, 0) ELSE 0 END) > 0
    THEN (
      (SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
          THEN (te.hours + te.minutes / 60.0) * COALESCE(si.unit_price, 0) ELSE 0 END)
       - SUM((te.hours + te.minutes / 60.0) * COALESCE(ecr.fully_loaded_rate, 0)))
      / SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
          THEN (te.hours + te.minutes / 60.0) * COALESCE(si.unit_price, 0) ELSE 0 END)
      * 100
    )
    ELSE 0 END AS margin_percent,
  COUNT(*) AS entry_count,
  SUM(CASE WHEN NOT COALESCE(c.is_internal, false) AND si.overhead_category IS NULL
      AND te.qb_item_id IS NULL THEN te.hours + te.minutes / 60.0 ELSE 0 END) AS unbilled_hours
FROM (
  SELECT
    t.*,
    (date_trunc('week', t.txn_date::date))::date AS week_start,
    (date_trunc('week', t.txn_date::date) + interval '6 days')::date AS week_end
  FROM time_entries t
  WHERE t.txn_date IS NOT NULL
) te
LEFT JOIN customers c ON c.qb_customer_id = te.qb_customer_id
LEFT JOIN service_items si ON si.qb_item_id = te.qb_item_id
LEFT JOIN employee_cost_rates ecr ON ecr.employee_name = te.employee_name AND ecr.is_active = true
WHERE EXISTS (
  SELECT 1 FROM profitability_snapshots ps
  WHERE ps.week_start = te.week_start
)
AND NOT EXISTS (
  SELECT 1 FROM customer_profitability cp
  WHERE cp.week_start = te.week_start AND cp.qb_customer_id = te.qb_customer_id
)
GROUP BY te.week_start, te.week_end, te.qb_customer_id, c.display_name
ON CONFLICT (week_start, qb_customer_id) DO NOTHING;
