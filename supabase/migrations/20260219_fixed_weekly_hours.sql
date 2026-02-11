-- Add fixed_weekly_hours to employee_cost_rates
-- Employees with fixed_weekly_hours > 0 who have no time entries in a period
-- will be auto-included as overhead in the profitability report.
-- Use for salaried employees who don't clock time in Workforce (e.g., Chimene Sweet).
-- Set to 0 once they start logging time in Workforce to avoid double-counting.

ALTER TABLE employee_cost_rates ADD COLUMN IF NOT EXISTS fixed_weekly_hours DECIMAL(5,2) DEFAULT 0;

-- Chimene Sweet: salaried 40 hrs/week, fixed admin overhead
UPDATE employee_cost_rates SET fixed_weekly_hours = 40 WHERE employee_name = 'Chimene Sweet';
