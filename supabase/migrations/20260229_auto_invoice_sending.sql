-- Auto Invoice Sending: extend invoice_log with send tracking columns + app_setting

-- Add new columns to invoice_log for QB send tracking and courtesy email tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'sent_via_qb') THEN
    ALTER TABLE invoice_log ADD COLUMN sent_via_qb BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'qb_sent_at') THEN
    ALTER TABLE invoice_log ADD COLUMN qb_sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'qb_sent_to_email') THEN
    ALTER TABLE invoice_log ADD COLUMN qb_sent_to_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'courtesy_email_sent') THEN
    ALTER TABLE invoice_log ADD COLUMN courtesy_email_sent BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'courtesy_email_sent_at') THEN
    ALTER TABLE invoice_log ADD COLUMN courtesy_email_sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'auto_generated') THEN
    ALTER TABLE invoice_log ADD COLUMN auto_generated BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Seed the auto_send_invoices setting (off by default)
INSERT INTO app_settings (key, value, updated_at)
VALUES ('auto_send_invoices', 'false', now())
ON CONFLICT (key) DO NOTHING;
