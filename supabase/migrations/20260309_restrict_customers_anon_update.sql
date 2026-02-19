-- Restrict anon UPDATE on customers to only the skip_acceptance_gate column.
-- The previous policy (20260307) allowed anon to update ANY column, which is a
-- security hole. RLS policies can't restrict by column, so we use a trigger
-- to reject changes to columns other than skip_acceptance_gate.

-- 1. Replace the wide-open UPDATE policy with one that still allows anon UPDATE
--    (needed for the invoices page toggle) but relies on the trigger guard below.
DROP POLICY IF EXISTS "Anon can update customer invoice overrides" ON customers;
CREATE POLICY "Anon can update customer invoice overrides" ON customers
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- 2. Create a trigger function that blocks anon from changing protected columns.
--    Only skip_acceptance_gate may be modified by anon; all other columns must
--    remain unchanged.
CREATE OR REPLACE FUNCTION restrict_anon_customer_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restrict the anon role; service_role can update anything
  IF current_setting('role', true) = 'anon'
     OR current_setting('request.jwt.claim.role', true) = 'anon'
     OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'anon'
  THEN
    -- Preserve all columns except skip_acceptance_gate
    NEW.id := OLD.id;
    NEW.qb_customer_id := OLD.qb_customer_id;
    NEW.display_name := OLD.display_name;
    NEW.email := OLD.email;
    NEW.is_active := OLD.is_active;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := OLD.updated_at;
    NEW.company_name := OLD.company_name;
    NEW.billing_email := OLD.billing_email;
    NEW.phone := OLD.phone;
    NEW.balance := OLD.balance;
    NEW.sync_token := OLD.sync_token;
    NEW.synced_at := OLD.synced_at;
    -- skip_acceptance_gate is the ONLY column anon can change
    -- NEW.skip_acceptance_gate keeps the value from the UPDATE statement
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_anon_customer_update ON customers;
CREATE TRIGGER guard_anon_customer_update
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION restrict_anon_customer_update();
