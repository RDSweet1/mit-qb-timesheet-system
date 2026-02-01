-- Fix RLS: Allow anonymous users to read data (for frontend)
-- Drop and recreate to avoid conflicts

-- service_items
DROP POLICY IF EXISTS "Anon users can read service_items" ON service_items;
CREATE POLICY "Anon users can read service_items" ON service_items
  FOR SELECT TO anon USING (true);

-- customers
DROP POLICY IF EXISTS "Anon users can read customers" ON customers;
CREATE POLICY "Anon users can read customers" ON customers
  FOR SELECT TO anon USING (true);

-- time_entries
DROP POLICY IF EXISTS "Anon users can read time_entries" ON time_entries;
CREATE POLICY "Anon users can read time_entries" ON time_entries
  FOR SELECT TO anon USING (true);

-- invoice_log
DROP POLICY IF EXISTS "Anon users can read invoice_log" ON invoice_log;
CREATE POLICY "Anon users can read invoice_log" ON invoice_log
  FOR SELECT TO anon USING (true);

-- email_senders
DROP POLICY IF EXISTS "Anon users can read email_senders" ON email_senders;
CREATE POLICY "Anon users can read email_senders" ON email_senders
  FOR SELECT TO anon USING (true);

-- email_log
DROP POLICY IF EXISTS "Anon users can read email_log" ON email_log;
CREATE POLICY "Anon users can read email_log" ON email_log
  FOR SELECT TO anon USING (true);
