-- Email Sender Configuration
-- Add this after running the main schema.sql

-- Email senders table (configured email accounts)
CREATE TABLE IF NOT EXISTS email_senders (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE email_senders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can read email_senders" ON email_senders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access email_senders" ON email_senders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert configured email accounts
INSERT INTO email_senders (email, display_name, is_default, is_active) VALUES
  ('accounting@mitigationconsulting.com', 'Mitigation Consulting - Accounting', true, true),
  ('rdsweet1@gmail.com', 'David Sweet', false, true),
  ('natashagarces11@gmail.com', 'Natasha Garces', false, true),
  ('sharon@mitigationconsulting.com', 'Sharon Kisner', false, true)
ON CONFLICT (email) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active;

-- Ensure only one default
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_senders_default
  ON email_senders(is_default)
  WHERE is_default = true;
