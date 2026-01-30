# Step 1: Deploy Database Schema

## 🎯 Objective
Create all database tables in Supabase with proper security and email sender configuration.

## ⏱️ Time Required
2-3 minutes

---

## 📋 Instructions

### Part A: Deploy Main Schema

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr
   - Login if needed

2. **Open SQL Editor**
   - Click **"SQL Editor"** in the left sidebar
   - Click **"New Query"** button

3. **Load Schema File**
   - Open file on your computer: `C:\SourceCode\WeeklyTimeBillingQB\sql\schema.sql`
   - Select ALL content (Ctrl+A)
   - Copy (Ctrl+C)

4. **Paste and Run**
   - Paste into Supabase SQL Editor (Ctrl+V)
   - Click **"Run"** button (or press Ctrl+Enter)
   - Wait for success message

**Expected Result:**
```
Success. No rows returned
```

### Part B: Deploy Email Senders

1. **Create New Query**
   - Click **"New Query"** in SQL Editor

2. **Load Email Configuration**
   - Open file: `C:\SourceCode\WeeklyTimeBillingQB\sql\email-senders.sql`
   - Copy ALL content

3. **Paste and Run**
   - Paste into SQL Editor
   - Click **"Run"**

**Expected Result:**
```
Success. 4 rows affected
```

---

## ✅ Verification

### Check Tables Created

1. In Supabase Dashboard, click **"Table Editor"** in left sidebar
2. You should see these 7 tables:
   - ✅ `customers`
   - ✅ `service_items`
   - ✅ `time_entries`
   - ✅ `invoice_log`
   - ✅ `email_log`
   - ✅ `app_users`
   - ✅ `email_senders`

### Check Email Senders

1. Click on `email_senders` table
2. You should see 4 rows:
   - ✅ accounting@mitigationconsulting.com (is_default = true)
   - ✅ rdsweet1@gmail.com (David Sweet)
   - ✅ natashagarces11@gmail.com (Natasha Garces)
   - ✅ sharon@mitigationconsulting.com (Sharon Kisner)

### Check Security

1. Click on any table → Click **"RLS disabled"** warning
2. You should see RLS is **ENABLED** (green checkmark)
3. Click **"Policies"** tab
4. You should see:
   - Policy for authenticated users (read)
   - Policy for service_role (full access)

---

## ❌ Troubleshooting

### Error: "relation already exists"
- **Solution:** Tables already created. Check Table Editor to verify.

### Error: "permission denied"
- **Solution:** Make sure you're logged in as project owner in Supabase dashboard.

### Tables missing after running
- **Solution:** Check for syntax errors in output. Scroll up in SQL Editor to see full error message.

---

## ✅ Completion Checklist

- [ ] Ran schema.sql successfully
- [ ] Ran email-senders.sql successfully
- [ ] Verified 7 tables exist in Table Editor
- [ ] Verified 4 email senders in email_senders table
- [ ] Verified RLS enabled on all tables

**Once complete, proceed to Step 2: Configure Azure Graph API**

---

## 🔗 Quick Links

- Supabase Project: https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr
- Schema File: `C:\SourceCode\WeeklyTimeBillingQB\sql\schema.sql`
- Email Config: `C:\SourceCode\WeeklyTimeBillingQB\sql\email-senders.sql`
