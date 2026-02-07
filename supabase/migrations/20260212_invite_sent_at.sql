-- Add invite tracking to app_users
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN app_users.invite_sent_at IS 'Timestamp when onboarding invitation email was sent';
