-- Fix: Set david as admin (original migration UPDATE was no-op since row didn't exist yet)
UPDATE app_users
SET is_admin = true,
    can_edit_time = true,
    can_manage_users = true,
    can_send_reminders = true,
    can_create_invoices = true
WHERE email = 'david@mitigationconsulting.com';
