# 🚀 SIMPLIFIED DEPLOYMENT INSTRUCTIONS

**I've automated everything I can. You need to complete 3 manual steps that require web browser login.**

**Total Time: 8 minutes**

---

## ✅ STEP 1: Deploy Database (2 minutes)

### What to do:

1. **Open this link in your browser:**
   ```
   https://supabase.com/dashboard/project/wppuhwrehjpsxjxqwsnr/sql/new
   ```

2. **Open this file on your computer:**
   ```
   C:\SourceCode\WeeklyTimeBillingQB\sql\combined-setup.sql
   ```

3. **Copy ALL contents** from the file (Ctrl+A, Ctrl+C)

4. **Paste into the Supabase SQL Editor** (Ctrl+V)

5. **Click "Run"** button

6. **Wait for:** "Success. 4 rows affected"

**Done!** 7 tables + 4 email senders are now created.

---

## ✅ STEP 2: Configure Azure Email (5 minutes)

### What to do:

1. **Open Azure Portal:**
   ```
   https://portal.azure.com
   ```

2. **Search for:** "App Registrations" (top search bar)

3. **Find app:** Search for `973b689d-d96c-4445-883b-739fff12330b`

4. **Click:** "API permissions" (left sidebar)

5. **Click:** "+ Add a permission"

6. **Select:** "Microsoft Graph" → "Application permissions"

7. **Check these 2 boxes:**
   - ☑️ Mail.Send
   - ☑️ Mail.Send.Shared

8. **Click:** "Add permissions"

9. **Click:** "Grant admin consent for [Your Org]" ⚠️ **CRITICAL**

10. **Click:** "Yes"

11. **Verify:** All permissions show "Granted"

12. **Wait 5 minutes** for propagation

**Done!** System can now send emails via Outlook.

---

## ✅ STEP 3: Get Supabase Token (1 minute)

### What to do:

1. **Open this link:**
   ```
   https://supabase.com/dashboard/account/tokens
   ```

2. **Click:** "Generate new token"

3. **Name it:** "Deployment"

4. **Click:** "Generate token"

5. **Copy the token**

6. **Paste it here in the chat** (reply with just the token)

**I'll use it to deploy the Edge Functions automatically for you.**

---

## 📊 WHAT HAPPENS AFTER:

Once you give me the Supabase token, I will:

1. ✅ Deploy all 4 Edge Functions
2. ✅ Configure all environment secrets
3. ✅ Test the backend
4. ✅ Verify everything works
5. 🎨 Build the Next.js frontend
6. 🚀 Deploy to Vercel for MIT Consulting

---

## 🎯 ACTION REQUIRED:

Complete Steps 1 and 2 above (7 minutes), then:

**Reply with:**
- "Database done" (after Step 1)
- "Azure done" (after Step 2)
- [Your Supabase token] (after Step 3)

Then I'll handle the rest automatically!

---

**START WITH STEP 1 NOW: Open the Supabase link and paste the SQL.**
