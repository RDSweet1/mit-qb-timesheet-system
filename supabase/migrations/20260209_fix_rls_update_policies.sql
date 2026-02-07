-- Migration: Fix RLS policies so frontend can update time entries
-- Created: 2026-02-09
-- Issue: Frontend uses anon key but UPDATE policy was only for authenticated role.
-- Unlock works (edge function uses service_role) but notes save and approval
-- fail silently because anon can't update.

-- Allow anon role to update unlocked time entries (for notes editing)
CREATE POLICY "Anon can update unlocked time entries"
ON time_entries
FOR UPDATE
TO anon
USING (
  is_locked = false
  AND (approval_status IS NULL OR approval_status::text != 'invoiced')
)
WITH CHECK (
  is_locked = false
  AND (approval_status IS NULL OR approval_status::text != 'invoiced')
);

-- Allow anon role to update approval fields on any entry
-- (Approval needs to work on locked entries too)
CREATE POLICY "Anon can update approval status"
ON time_entries
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Also allow anon to insert into audit log (for client-side audit logging)
CREATE POLICY "Anon can insert audit logs"
ON time_entry_audit_log
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to read audit logs
CREATE POLICY "Anon can read audit logs"
ON time_entry_audit_log
FOR SELECT
TO anon
USING (true);
