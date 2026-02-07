-- Migration: User Management & Multi-User Access
-- Created: 2026-02-07
-- Purpose: Fix column mismatch between edge functions and DB, add new user,
--          set up admin permissions and RLS for app_users

-- 1. Add missing columns that edge functions reference
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit_time BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN DEFAULT false;

-- 2. Insert new user: skisner@mitigationconsulting.com (default viewer permissions)
INSERT INTO app_users (entra_id, email, display_name, can_view, can_send_reminders, can_create_invoices, is_admin, can_edit_time, can_manage_users)
VALUES ('pending-entra-id-skisner', 'skisner@mitigationconsulting.com', 'Sharon Kisner', true, false, false, false, false, false)
ON CONFLICT (email) DO NOTHING;

-- 3. Update david@mitigationconsulting.com to admin with all permissions
UPDATE app_users
SET is_admin = true,
    can_edit_time = true,
    can_manage_users = true,
    can_send_reminders = true,
    can_create_invoices = true
WHERE email = 'david@mitigationconsulting.com';

-- 4. Enable RLS on app_users
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for app_users
-- Authenticated users can read their own record
CREATE POLICY "Users can read own profile"
ON app_users
FOR SELECT
TO authenticated
USING (true);

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access app_users"
ON app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
