# 🚀 Deploy Frontend to Vercel - Step-by-Step

## Quick Deploy (5 Minutes)

Your frontend is ready at: https://github.com/RDSweet1/mit-qb-frontend

---

## **Method 1: Vercel Dashboard (Recommended - Easiest)**

### **Step 1: Go to Vercel**
Open: **https://vercel.com/new**

### **Step 2: Import GitHub Repository**
1. Click **"Import Git Repository"**
2. If prompted, authorize Vercel to access GitHub
3. Find: **mit-qb-frontend**
4. Click **"Import"**

### **Step 3: Configure Project**
Vercel will auto-detect Next.js settings:

- **Framework Preset:** Next.js (auto-detected ✓)
- **Root Directory:** `./` (leave default)
- **Build Command:** `npm run build` (auto-filled ✓)
- **Output Directory:** `.next` (auto-filled ✓)

### **Step 4: Add Environment Variables**

Click **"Environment Variables"** and add these:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://migcpasmtbdojqphqyzc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ` |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | (Get from Azure Portal - see below) |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | (Get from Azure Portal - see below) |
| `NEXT_PUBLIC_REDIRECT_URI` | (Will be your Vercel URL - add after deployment) |

**Note:** You'll add `NEXT_PUBLIC_REDIRECT_URI` after you get your Vercel URL in Step 6.

### **Step 5: Deploy**
1. Click **"Deploy"**
2. Wait 2-3 minutes while Vercel builds
3. You'll see a progress bar

### **Step 6: Get Your Production URL**
After deployment completes, you'll see:
```
🎉 Your project is live!
Production: https://mit-qb-frontend-xyz.vercel.app
```

**Copy this URL!** You need it for the next steps.

### **Step 7: Update Environment Variables**
1. In Vercel Dashboard, go to your project
2. Click **Settings** > **Environment Variables**
3. Add one more variable:
   - Name: `NEXT_PUBLIC_REDIRECT_URI`
   - Value: (Your Vercel URL from Step 6)
   - Example: `https://mit-qb-frontend-xyz.vercel.app`
4. Click **Save**

### **Step 8: Redeploy**
1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Wait 1 minute
4. Done!

---

## **Get Azure AD Credentials**

You need these for environment variables:

### **Step 1: Go to Azure Portal**
Open: **https://portal.azure.com**

### **Step 2: Navigate to App Registrations**
1. Search for "App registrations" in the top search bar
2. Click on your existing app (if you have one)
   - Or create new: Click **"+ New registration"**

### **Step 3: Get Client ID**
- On the Overview page, find **Application (client) ID**
- Copy this value
- This is your `NEXT_PUBLIC_AZURE_CLIENT_ID`

### **Step 4: Get Tenant ID**
- On the Overview page, find **Directory (tenant) ID**
- Copy this value
- This is your `NEXT_PUBLIC_AZURE_TENANT_ID`

### **Step 5: Add Redirect URI**
1. Click **Authentication** in the left menu
2. Under **Platform configurations** > **Web**
3. Click **"Add URI"**
4. Add your Vercel URL: `https://mit-qb-frontend-xyz.vercel.app`
5. Click **Save**

### **Step 6: Verify API Permissions**
1. Click **API permissions** in left menu
2. Make sure these are granted:
   - ✅ Microsoft Graph > User.Read
   - ✅ Microsoft Graph > Mail.Send
   - ✅ Microsoft Graph > email
   - ✅ Microsoft Graph > profile
   - ✅ Microsoft Graph > openid
3. If missing, click **"+ Add a permission"** and add them

---

## **Test Your Deployment**

### **Step 1: Open Your App**
Go to: `https://your-vercel-url.vercel.app`

### **Step 2: Test Login**
1. Click **"Sign in with Microsoft"**
2. Login with your MIT Consulting email
3. Should redirect to dashboard

### **Step 3: Test Enhanced Reports Tool**
1. Navigate to: `https://your-vercel-url.vercel.app/reports-enhanced`
2. You should see the new bookkeeper tool!
3. Try setting a date range
4. Click "Refresh" to load data

### **Step 4: Test Other Pages**
- `/` - Dashboard ✓
- `/time-entries` - Time entries ✓
- `/reports` - Basic reports ✓
- `/reports-enhanced` - **New bookkeeper tool** ✓
- `/invoices` - Invoices ✓
- `/settings` - Settings ✓

---

## **Troubleshooting**

### **Build Failed**
**Error:** "Module not found" or build errors

**Solution:**
1. Check that all dependencies are in `package.json`
2. Vercel should install them automatically
3. Check build logs in Vercel Dashboard

### **Can't Login**
**Error:** "Failed to authenticate" or redirect issues

**Solution:**
1. Verify `NEXT_PUBLIC_AZURE_CLIENT_ID` is correct
2. Verify `NEXT_PUBLIC_AZURE_TENANT_ID` is correct
3. Verify redirect URI in Azure matches Vercel URL exactly
4. Make sure API permissions are granted in Azure

### **Environment Variables Not Working**
**Error:** Variables are undefined

**Solution:**
1. Go to Vercel Settings > Environment Variables
2. Make sure all 5 variables are added
3. Click "Redeploy" after adding variables
4. Hard refresh browser: Ctrl+Shift+R

### **Reports Tool Shows No Data**
**Error:** No time entries appear

**Solution:**
1. Check Supabase connection (Settings page)
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
4. Make sure time entries exist in Supabase

---

## **Custom Domain (Optional)**

### **Add Your Own Domain:**

1. **In Vercel Dashboard:**
   - Go to **Settings** > **Domains**
   - Add domain: `timesheet.mitigationconsulting.com`
   - Follow DNS instructions

2. **Update Azure AD:**
   - Add custom domain as redirect URI
   - Update `NEXT_PUBLIC_REDIRECT_URI` environment variable

3. **Redeploy**

---

## **Environment Variables Quick Reference**

```env
# Supabase (Backend)
NEXT_PUBLIC_SUPABASE_URL=https://migcpasmtbdojqphqyzc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Azure AD (Authentication) - GET THESE FROM AZURE PORTAL
NEXT_PUBLIC_AZURE_CLIENT_ID=your-client-id-here
NEXT_PUBLIC_AZURE_TENANT_ID=your-tenant-id-here

# Vercel URL (Add after deployment)
NEXT_PUBLIC_REDIRECT_URI=https://your-vercel-url.vercel.app
```

---

## **What Happens After Deployment**

### **Your App Will Be Live At:**
```
https://mit-qb-frontend-xyz.vercel.app
```

### **Your Bookkeeper Can Access:**
```
Main Dashboard:
https://your-url.vercel.app/

Enhanced Reports Tool:
https://your-url.vercel.app/reports-enhanced
```

### **All Features Work:**
- ✅ Microsoft SSO login
- ✅ Time entries sync
- ✅ Weekly reports (basic)
- ✅ **Weekly reports (enhanced with search/filter)** ← NEW!
- ✅ Monthly invoices
- ✅ Settings and monitoring

---

## **Automatic Updates**

**Future code changes:**
1. Push to GitHub: `git push origin main`
2. Vercel auto-deploys (2-3 minutes)
3. Your app updates automatically!

---

## **Summary Checklist**

- [ ] Go to vercel.com/new
- [ ] Import mit-qb-frontend repository
- [ ] Add 4 environment variables (without REDIRECT_URI)
- [ ] Click Deploy
- [ ] Wait 2-3 minutes
- [ ] Copy production URL
- [ ] Add REDIRECT_URI environment variable
- [ ] Redeploy
- [ ] Get Azure Client ID and Tenant ID
- [ ] Update environment variables in Vercel
- [ ] Add redirect URI in Azure Portal
- [ ] Test login
- [ ] Test Enhanced Reports Tool at /reports-enhanced
- [ ] Share URL with your bookkeeper!

---

**Total Time: 5-10 minutes**

**Result: Production-ready app with enhanced bookkeeper tool!** 🎉
