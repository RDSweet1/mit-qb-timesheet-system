-- Fix the guard trigger to use actual customers table columns.
-- Previous migration (20260309) referenced non-existent columns.

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
    NEW.net_terms := OLD.net_terms;
    NEW.is_active := OLD.is_active;
    NEW.synced_at := OLD.synced_at;
    NEW.is_internal := OLD.is_internal;
    -- skip_acceptance_gate is the ONLY column anon can change
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
