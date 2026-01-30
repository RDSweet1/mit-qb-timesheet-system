# QuickBooks Timesheet & Billing System - Setup Guide

## ✅ COMPLETED STEPS

### 1. Environment Configuration (.env)
All credentials configured:
- ✅ QuickBooks OAuth (Client ID, Secret, Access Token, Refresh Token, Realm ID)
- ✅ Supabase (URL, Keys for project: wppuhwrehjpsxjxqwsnr)
- ✅ Azure/Microsoft (Tenant ID, Client ID, Secret for Graph API)
- ✅ Email sender: accounting@mitigationconsulting.com

### 2. QuickBooks API Connection
- ✅ Tested and verified
- ✅ Can read Company Info
- ✅ Can query Service Items (cost codes with rates)
- ✅ Can query Time Entries
- ✅ Realm ID: 9341456256329564 (Sandbox)

---

## 🚀 NEXT STEPS

### Step 1: Deploy Database Schema (5 minutes)

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to: https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr
2. Click **"SQL Editor"** in left sidebar
3. Click **"New Query"**
4. Copy and paste contents of `sql/schema.sql`
5. Click **"Run"** or press Ctrl+Enter
6. Verify tables created (you should see 6 tables)
7. Run `sql/email-senders.sql` to add email sender configuration

**Option B: Via psql (if you have PostgreSQL client)**

```bash
psql "postgresql://postgres:[YOUR_DB_PASSWORD]@db.wppuhwrehjpsxjxqwsnr.supabase.co:5432/postgres" < sql/schema.sql
psql "postgresql://postgres:[YOUR_DB_PASSWORD]@db.wppuhwrehjpsxjxqwsnr.supabase.co:5432/postgres" < sql/email-senders.sql
```

**Tables Created:**
- `customers` - QB customer cache
- `service_items` - Cost codes with rates
- `time_entries` - Time tracking (with description & notes fields)
- `invoice_log` - Monthly billing history
- `email_log` - Weekly reminder tracking
- `app_users` - Authorized users
- `email_senders` - Configured email accounts

**Email Senders Configured:**
- ✅ accounting@mitigationconsulting.com (DEFAULT)
- ✅ David Sweet (rdsweet1@gmail.com)
- ✅ Natasha Garces (natashagarces11@gmail.com)
- ✅ Sharon Kisner (sharon@mitigationconsulting.com)

---

### Step 2: Configure Azure Graph API Permissions (10 minutes)

Your Azure App (Client ID: 973b689d-d96c-4445-883b-739fff12330b) needs email sending permissions.

1. Go to: https://portal.azure.com
2. Navigate to **Azure Active Directory** → **App Registrations**
3. Find app: "Email Scrapper Azure App" (or the app with ID 973b689d...)
4. Click **"API Permissions"** in left sidebar

**Required Permissions:**
- ✅ Mail.Read (already configured)
- ✅ User.Read.All (already configured)
- ⚠️ **ADD THIS:** `Mail.Send` (Application permission)
- ⚠️ **ADD THIS:** `Mail.Send.Shared` (Application permission - for sending from accounting@)

5. Click **"Add a permission"**
6. Select **"Microsoft Graph"**
7. Select **"Application permissions"**
8. Search for and check:
   - `Mail.Send`
   - `Mail.Send.Shared`
9. Click **"Add permissions"**
10. Click **"Grant admin consent for [Your Organization]"** ⚠️ IMPORTANT

**Note:** You may need to wait 5-10 minutes for permissions to propagate.

---

### Step 3: Deploy Edge Functions (15 minutes)

The edge functions are already created. Deploy them to Supabase:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref wppuhwrehjpsxjxqwsnr

# Deploy all functions
supabase functions deploy sync-service-items
supabase functions deploy qb-time-sync
supabase functions deploy send-reminder
supabase functions deploy create-invoices

# Set environment secrets
supabase secrets set QB_CLIENT_ID=ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a
supabase secrets set QB_CLIENT_SECRET=O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU
supabase secrets set QB_REALM_ID=9341456256329564
supabase secrets set QB_ENVIRONMENT=sandbox
supabase secrets set AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb
supabase secrets set AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b
supabase secrets set AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET_HERE
```

**Functions Deployed:**
1. `sync-service-items` - Syncs cost codes from QB to Supabase
2. `qb-time-sync` - Reads time entries from QB
3. `send-reminder` - Sends weekly reports via Outlook
4. `create-invoices` - Creates monthly invoices in QB

---

### Step 4: Initial Data Sync (2 minutes)

Once functions are deployed, run initial sync:

```bash
# Sync cost codes (service items) from QuickBooks
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/sync-service-items \
  -H "Authorization: Bearer [YOUR_SUPABASE_SERVICE_KEY]"

# Sync time entries for the last 30 days
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/qb-time-sync \
  -H "Authorization: Bearer [YOUR_SUPABASE_SERVICE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2026-01-01", "endDate": "2026-01-31"}'
```

---

### Step 5: Schedule Weekly Reminders (5 minutes)

Set up pg_cron to send weekly reports every Monday at 8 AM:

1. Go to Supabase Dashboard → SQL Editor
2. Run this SQL:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly reminder (Monday 8 AM)
SELECT cron.schedule(
  'send-weekly-reminders',
  '0 8 * * 1',  -- Every Monday at 8 AM
  $$
  SELECT net.http_post(
    url := 'https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer [YOUR_SUPABASE_SERVICE_KEY]',
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Schedule daily QB time sync (3 AM)
SELECT cron.schedule(
  'sync-qb-time-daily',
  '0 3 * * *',  -- Every day at 3 AM
  $$
  SELECT net.http_post(
    url := 'https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/qb-time-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer [YOUR_SUPABASE_SERVICE_KEY]',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'startDate', (CURRENT_DATE - INTERVAL '7 days')::text,
      'endDate', CURRENT_DATE::text
    )
  );
  $$
);
```

---

## 📋 SYSTEM ARCHITECTURE

### Weekly Reports (Automated)
- **Trigger:** pg_cron every Monday 8 AM
- **Process:**
  1. Sync latest time from QuickBooks
  2. Group time by customer for the past week
  3. Calculate estimated billing (hours × rates from cost codes)
  4. Send HTML email via Microsoft Outlook
- **Email Message:** "DO NOT PAY. This is for your information only to update you on work-in-progress completed on your project this week. Billing will be consolidated at the end of the month."

### Monthly Invoicing (Manual Trigger)
- **Trigger:** Dashboard button or API call
- **Process:**
  1. Sync time for billing period
  2. Group by customer
  3. Create Invoice in QuickBooks with line items:
     - Date, Employee, Cost Code
     - Description & Notes (separate fields)
     - Time in/out or lump sum hours
     - Rate from service item
  4. Mark time entries as "HasBeenBilled" in QB
  5. Email invoice via QuickBooks (uses QB's built-in email system)

---

## 🔒 SECURITY

- **Row Level Security (RLS):** Enabled on all tables
- **Service Role:** Full access for Edge Functions
- **Authenticated Users:** Read-only access
- **OAuth Tokens:** Stored in .env (move to Azure Key Vault for production)
- **API Keys:** Service role key protects all function endpoints

---

## 🧪 TESTING

### Test Weekly Email (Manual)
```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/send-reminder \
  -H "Authorization: Bearer [SERVICE_KEY]"
```

### Test Monthly Invoicing (Manual)
```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/create-invoices \
  -H "Authorization: Bearer [SERVICE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": 1,
    "periodStart": "2026-01-01",
    "periodEnd": "2026-01-31",
    "createdBy": "admin@mitigationconsulting.com"
  }'
```

---

## 📞 SUPPORT

- QuickBooks OAuth: https://developer.intuit.com/app/developer/playground
- Supabase Dashboard: https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr
- Azure Portal: https://portal.azure.com

---

## ⚠️ IMPORTANT REMINDERS

1. **Access Token Expires in 1 Hour**
   - System auto-refreshes on each API call
   - Refresh token stored and rotated automatically

2. **Sandbox vs Production**
   - Currently in SANDBOX mode
   - Switch to production: Update QB_ENVIRONMENT=production in .env

3. **Email Sender**
   - Default: accounting@mitigationconsulting.com
   - Requires Mail.Send permission in Azure
   - Must be a valid mailbox in your Microsoft 365 tenant

4. **Cost Codes = Service Items**
   - Rates are stored in QuickBooks
   - Synced to Supabase for caching
   - Update rates in QB, then re-sync

5. **Time Entry Fields**
   - Description: What you're doing (PM, estimator, consultant, etc.)
   - Notes: Additional details (separate field)
   - Supports both clock in/out AND lump sum entries
