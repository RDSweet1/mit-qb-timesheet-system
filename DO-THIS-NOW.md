# 🚀 DEPLOY BACKEND - DO THIS NOW

Follow these steps in order. Estimated time: 30 minutes total.

---

## ✅ STEP 1: Deploy Database (2 minutes)

### 1.1 Open Supabase SQL Editor

1. Go to: **https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr**
2. Click **"SQL Editor"** in the left sidebar
3. Click **"New Query"** button (top right)

### 1.2 Run Main Schema

1. Open this file on your computer:
   ```
   C:\SourceCode\WeeklyTimeBillingQB\sql\schema.sql
   ```

2. **Select ALL** (Ctrl+A) and **Copy** (Ctrl+C)

3. **Paste** into Supabase SQL Editor (Ctrl+V)

4. Click **"Run"** button (or press Ctrl+Enter)

5. Wait for: ✅ **"Success. No rows returned"**

### 1.3 Run Email Configuration

1. Click **"New Query"** again

2. Open this file:
   ```
   C:\SourceCode\WeeklyTimeBillingQB\sql\email-senders.sql
   ```

3. **Select ALL** and **Copy**

4. **Paste** into SQL Editor

5. Click **"Run"**

6. Wait for: ✅ **"Success. 4 rows affected"**

### 1.4 Verify Database

1. Click **"Table Editor"** in left sidebar

2. You should see **7 tables:**
   - ✅ customers
   - ✅ service_items
   - ✅ time_entries
   - ✅ invoice_log
   - ✅ email_log
   - ✅ app_users
   - ✅ email_senders

3. Click on **"email_senders"** table

4. You should see **4 rows:**
   - ✅ accounting@mitigationconsulting.com (is_default = true)
   - ✅ rdsweet1@gmail.com
   - ✅ natashagarces11@gmail.com
   - ✅ sharon@mitigationconsulting.com

---

## ✅ STEP 2: Configure Azure (5 minutes)

### 2.1 Open Azure Portal

1. Go to: **https://portal.azure.com**

2. Sign in with your Microsoft account

### 2.2 Find Your App Registration

1. In the search bar at top, type: **"App Registrations"**

2. Click **"App Registrations"** service

3. Search for: **973b689d-d96c-4445-883b-739fff12330b**
   (Or search for app name: **"Email Scrapper"**)

4. Click on the app to open it

### 2.3 Add Email Permissions

1. In left sidebar, click **"API permissions"**

2. You'll see existing permissions (Mail.Read, User.Read.All)

3. Click **"+ Add a permission"** button

4. Click **"Microsoft Graph"**

5. Click **"Application permissions"** (NOT Delegated)

6. In search box, type: **"Mail.Send"**

7. Check these 2 boxes:
   - ☑️ **Mail.Send**
   - ☑️ **Mail.Send.Shared**

8. Click **"Add permissions"** button at bottom

### 2.4 Grant Admin Consent (CRITICAL!)

1. You should now see in the permissions list:
   - Mail.Read (Granted)
   - Mail.Send (Not granted) ⬅️ Need to fix
   - Mail.Send.Shared (Not granted) ⬅️ Need to fix
   - User.Read.All (Granted)

2. Click the button: **"Grant admin consent for [Your Organization]"**

3. Click **"Yes"** in the popup

4. Verify all permissions now show: ✅ **"Granted for [Your Org]"**

### 2.5 Wait for Propagation

⏰ **Wait 5-10 minutes** for Azure to propagate the new permissions.

☕ Take a coffee break!

---

## ✅ STEP 3: Deploy Edge Functions (15 minutes)

### 3.1 Install Supabase CLI

Open a **NEW terminal/command prompt** and run:

```bash
npm install -g supabase
```

Wait for installation to complete.

Verify:
```bash
supabase --version
```

You should see a version number.

### 3.2 Login to Supabase

**First, get your access token:**

1. Go to: **https://supabase.com/dashboard/account/tokens**

2. Click **"Generate new token"**

3. Name: **"CLI Deployment"**

4. Click **"Generate token"**

5. **COPY THE TOKEN** (you won't see it again!)

**Now login:**

```bash
supabase login
```

When prompted, **paste your token** and press Enter.

### 3.3 Link to Project

```bash
cd C:\SourceCode\WeeklyTimeBillingQB

supabase link --project-ref wppuhwrehjpsxjxqwsnr
```

You should see: ✅ **"Linked to project wppuhwrehjpsxjxqwsnr"**

### 3.4 Deploy All Functions

Run these commands one by one:

```bash
supabase functions deploy sync-service-items
```
Wait for: ✅ **"Deployed Function sync-service-items"**

```bash
supabase functions deploy qb-time-sync
```
Wait for: ✅ **"Deployed Function qb-time-sync"**

```bash
supabase functions deploy send-reminder
```
Wait for: ✅ **"Deployed Function send-reminder"**

```bash
supabase functions deploy create-invoices
```
Wait for: ✅ **"Deployed Function create-invoices"**

### 3.5 Set Environment Secrets

Run these commands (copy/paste each line):

```bash
supabase secrets set QB_CLIENT_ID=ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a

supabase secrets set QB_CLIENT_SECRET=O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU

supabase secrets set QB_REALM_ID=9341456256329564

supabase secrets set QB_ENVIRONMENT=sandbox

supabase secrets set AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb

supabase secrets set AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b

supabase secrets set AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET_HERE
```

**NOW SET THE QB TOKENS** (these are long):

```bash
supabase secrets set QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..ImuEB5Zem2v7mQWmDi0L7g.DoT62xGqG8S7VQqVaZGBEK_kfrQpXDPxs_RUQa2-1P922z-H8PKEdS2sgxM34T4gINMZVSStmqpJBFC91hCkHXAtj1jVDhPQaV96CayA04PzCx7FzhLprBmPMo9HMOp8nLGcjoxiBfjTsASL9mpgCs3r_3JDVPL8UtuJqGBnvgQPIwS4VrOY7i-Lk0TDTiele4R2w9Le8Fl4Y9qQqZckrRkkHg6hT1UmDzqU1GX2lU8BwT8S-sItscveJDKhCtHR-2qEuVUN9LwpYWqVXde8LxEgQTiKl6WuOylbv1I56C8r9Vin9iaSOw8EJ5tm4TBiMA9xJ4kIKPdLeY_AyqkAS24fr3FIcHewzLBnjLw1w_n101c5mAVWt-efm0ktfqNsC-1TvF_3jDWlPhrJJm1nqkOQb61DFDLJDAlYpg4tuBEhjYAyCwiAmG-PTiqLz57HdNDtoSlb0wo9Hxc65ns2zJ8MLf02ULs5xQMyBODy5q_OYMAa4QO45DAASMxLLwVRdzS-28nj5s3qRwcFy3740-MDILVrExlv9FF3uA_-8AH_Qy7wwC9DJOrzyOCFCC0_lKr_qCvMmNPeNdD7Aj1h7Ib6HPBnt-5-7z6UGFhWHAeCc1ESM0mX5efYmL-HT7b6.a9Bd4B1oB4fStEkazhZ6-Q

supabase secrets set QB_REFRESH_TOKEN=RT1-222-IIb-17784204R0vt2sAmsl8ncvdklSa3zw
```

**Note:** Type 'y' and press Enter if asked to confirm each secret.

### 3.6 Verify Deployment

```bash
supabase functions list
```

You should see all 4 functions with status **"deployed"**:
- ✅ sync-service-items
- ✅ qb-time-sync
- ✅ send-reminder
- ✅ create-invoices

---

## ✅ STEP 4: Test Backend (5 minutes)

### 4.1 Test Service Items Sync

Copy this entire command and run it:

```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/sync-service-items -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcHVod3JlaGpwc3hqeHF3c25yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQxMjQ2MSwiZXhwIjoyMDc4OTg4NDYxfQ.1s0zfM6u4YYsb1js1nKUGegQzDWiCZvq2m6CTchpdgg"
```

**Expected Result:**
```json
{
  "success": true,
  "synced": 5,
  "total": 5,
  "items": [...]
}
```

### 4.2 Test Time Entries Sync

```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/qb-time-sync -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcHVod3JlaGpwc3hqeHF3c25yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQxMjQ2MSwiZXhwIjoyMDc4OTg4NDYxfQ.1s0zfM6u4YYsb1js1nKUGegQzDWiCZvq2m6CTchpdgg" -H "Content-Type: application/json" -d "{\"startDate\": \"2026-01-01\", \"endDate\": \"2026-01-31\"}"
```

**Expected Result:**
```json
{
  "success": true,
  "synced": 0,
  "total": 0
}
```
(0 is OK - means no time entries in QB sandbox yet)

### 4.3 Verify Data in Supabase

1. Go back to Supabase Dashboard → Table Editor

2. Click **"service_items"** table
   - You should see **5 rows** (cost codes from QuickBooks)
   - Check they have rates (unit_price column)

3. Click **"customers"** table
   - May be empty if no time entries exist yet

4. Click **"time_entries"** table
   - May be empty if no time entries in QB

---

## 🎉 SUCCESS!

If all steps completed successfully, your backend is now **LIVE and OPERATIONAL**!

---

## 📞 WHEN YOU'RE DONE

Let me know in the chat when you've completed all 4 steps, and I'll:

1. ✅ Verify everything is working
2. 🎨 Start building the **Next.js frontend** with:
   - Microsoft SSO login
   - Dashboard for MIT Consulting team
   - Weekly report button
   - Invoice creation UI
   - User management

---

## ❌ IF YOU GET STUCK

**Common Issues:**

1. **"supabase: command not found"**
   - Restart your terminal after npm install
   - Or try: `npx supabase` instead of `supabase`

2. **"Failed to deploy function"**
   - Check function logs: `supabase functions logs [function-name]`
   - Make sure you're in the right directory: `cd C:\SourceCode\WeeklyTimeBillingQB`

3. **"Invalid JWT" or auth errors**
   - Logout and login again: `supabase logout` then `supabase login`

4. **Test commands fail**
   - Wait 2-3 minutes after deployment for functions to be ready
   - Check secrets are set: `supabase secrets list`

---

## 📁 WHERE TO FIND FILES

All files are in: `C:\SourceCode\WeeklyTimeBillingQB\`

- SQL files: `sql/` folder
- Function code: `supabase/functions/` folder
- Documentation: Root folder

---

**START WITH STEP 1 NOW!**
