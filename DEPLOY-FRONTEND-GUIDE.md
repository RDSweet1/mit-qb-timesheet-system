# 🚀 Deploy Frontend to Vercel - Complete Guide

## Quick Deploy (Automated Script)

```bash
.\deploy-frontend-to-vercel.bat
```

This script will:
1. Check/install Vercel CLI
2. Login to Vercel (opens browser)
3. Deploy the frontend to production
4. Show you the production URL

---

## Manual Deployment (Alternative)

### **Step 1: Install Vercel CLI**

```bash
npm install -g vercel
```

### **Step 2: Login to Vercel**

```bash
vercel login
```

A browser window will open - sign in with GitHub/GitLab/Email.

### **Step 3: Deploy**

```bash
cd frontend
vercel --prod
```

Wait for deployment to complete (2-3 minutes).

---

## After Deployment - Critical Setup

### **1. Copy Your Production URL**

After deployment, Vercel will show:
```
Production: https://mit-qb-timesheet-abc123.vercel.app
```

**Save this URL** - you'll need it for the next steps.

---

### **2. Set Environment Variables in Vercel**

#### **Option A: Vercel Dashboard (Recommended)**

1. Go to: https://vercel.com/dashboard
2. Click on your project
3. Go to **Settings** > **Environment Variables**
4. Add these variables (one by one):

| Variable Name | Value |
|---------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://migcpasmtbdojqphqyzc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ` |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | (Your Azure App Client ID) |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | (Your Azure Tenant ID) |
| `NEXT_PUBLIC_REDIRECT_URI` | (Your Vercel URL from Step 1) |

**Important:** Select **Production**, **Preview**, and **Development** for all variables.

#### **Option B: Vercel CLI**

```bash
cd frontend

vercel env add NEXT_PUBLIC_SUPABASE_URL
# Paste: https://migcpasmtbdojqphqyzc.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

vercel env add NEXT_PUBLIC_AZURE_CLIENT_ID
# Paste your Azure Client ID

vercel env add NEXT_PUBLIC_AZURE_TENANT_ID
# Paste your Azure Tenant ID

vercel env add NEXT_PUBLIC_REDIRECT_URI
# Paste your Vercel production URL
```

---

### **3. Redeploy with Environment Variables**

After setting environment variables, redeploy to apply them:

```bash
cd frontend
vercel --prod
```

---

### **4. Configure Azure AD (Microsoft Entra ID)**

#### **Add Redirect URI:**

1. Go to: https://portal.azure.com
2. Navigate to **Azure Active Directory** > **App registrations**
3. Select your app: **MIT Consulting Timesheet**
4. Go to **Authentication** > **Platform configurations** > **Web**
5. Click **Add URI**
6. Add: `https://your-vercel-url.vercel.app` (replace with actual URL)
7. Click **Save**

#### **Verify API Permissions:**

Make sure these permissions are granted:
- ✅ Microsoft Graph > User.Read
- ✅ Microsoft Graph > Mail.Send
- ✅ Microsoft Graph > email
- ✅ Microsoft Graph > profile
- ✅ Microsoft Graph > openid

---

## Testing the Deployment

### **1. Open Your Production URL**

```
https://your-vercel-url.vercel.app
```

### **2. Test Authentication**

1. Click **"Sign in with Microsoft"**
2. Authenticate with your Microsoft account
3. Should redirect to dashboard

### **3. Test Pages**

- ✅ Dashboard loads
- ✅ Time Entries page accessible
- ✅ Reports page accessible
- ✅ Invoices page accessible
- ✅ Settings page accessible

### **4. Test API Calls**

- Go to Time Entries
- Click "Sync from QuickBooks"
- Should fetch data (or show error if QB not connected)

---

## Troubleshooting

### **Issue: "Environment variables not found"**

**Solution:**
1. Check variables are set in Vercel Dashboard
2. Redeploy: `vercel --prod`
3. Hard refresh browser: Ctrl+Shift+R

---

### **Issue: "Failed to authenticate with Microsoft"**

**Solution:**
1. Verify Azure AD redirect URI matches Vercel URL exactly
2. Check Client ID and Tenant ID are correct
3. Clear browser cache and cookies
4. Try in incognito mode

---

### **Issue: "CORS error when calling Supabase"**

**Solution:**
1. Verify Supabase URL and anon key are correct
2. Check Supabase project is running
3. Verify Edge Functions are deployed
4. Check browser console for specific error

---

### **Issue: "Vercel deployment failed"**

**Solution:**
1. Check build logs in Vercel Dashboard
2. Verify `package.json` dependencies are correct
3. Try building locally first:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
4. If local build works, redeploy:
   ```bash
   vercel --prod --force
   ```

---

## Custom Domain (Optional)

### **Add Custom Domain:**

1. Go to Vercel Dashboard > Your Project
2. Click **Settings** > **Domains**
3. Add domain: `timesheet.mitigationconsulting.com`
4. Update DNS records as instructed by Vercel
5. Update Azure AD redirect URI to use custom domain
6. Update `NEXT_PUBLIC_REDIRECT_URI` environment variable

---

## Monitoring & Logs

### **View Deployment Logs:**
- Vercel Dashboard > Your Project > Deployments > Click deployment

### **View Runtime Logs:**
- Vercel Dashboard > Your Project > Deployments > Functions > Logs

### **Analytics:**
- Vercel Dashboard > Your Project > Analytics

---

## Update Deployment

### **Deploy Code Changes:**

```bash
cd frontend
vercel --prod
```

### **Update Environment Variables:**

1. Vercel Dashboard > Settings > Environment Variables
2. Edit variable
3. Redeploy to apply changes

---

## Rollback Deployment

If something goes wrong:

1. Go to Vercel Dashboard > Your Project > Deployments
2. Find previous working deployment
3. Click **"..."** > **Promote to Production**

---

## Next Steps After Deployment

Once the frontend is deployed and tested:

1. ✅ Frontend deployed to Vercel
2. ✅ Environment variables configured
3. ✅ Azure AD redirect URI updated
4. ✅ Authentication tested
5. 🔄 **Configure production automation** (Task #8)
6. 🔄 **End-to-end testing** (Task #9)

---

## Support

**Issues?**
- Check Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- MIT Consulting: accounting@mitigationconsulting.com

---

## Summary Checklist

- [ ] Run `.\deploy-frontend-to-vercel.bat`
- [ ] Copy production URL
- [ ] Set environment variables in Vercel Dashboard
- [ ] Redeploy with variables: `vercel --prod`
- [ ] Update Azure AD redirect URI
- [ ] Test authentication
- [ ] Test all pages (Time Entries, Reports, Invoices, Settings)
- [ ] Verify API calls work

**Once complete, you're ready for production automation setup!** 🎉
