# Getting Production Keys Guide

## ✅ Already Configured

These are already set up in GitHub secrets:
- **Supabase URL**: From your Supabase project
- **Supabase Anon Key**: From your Supabase project
- **Redirect URI**: Your GitHub Pages URL

---

## 🔑 QuickBooks Keys (Required)

### Step 1: Get QuickBooks Developer Credentials

1. Go to: https://developer.intuit.com
2. Sign in with your Intuit account
3. Click **"My Apps"** → **"Create an app"**
4. Choose **"QuickBooks Online and Payments"**
5. Fill in app details:
   - **App Name**: MIT QuickBooks Timesheet System
   - **Description**: Weekly time tracking and billing system
   - **Redirect URI**: `https://rdsweet1.github.io/mit-qb-frontend/oauth-callback`

6. After creation, go to **"Keys & OAuth"** tab
7. Copy these values:
   - **Client ID** (starts with AB...)
   - **Client Secret** (starts with...)
   - **Realm ID** (your QuickBooks Company ID)

### Step 2: Add to Backend Environment

```bash
# Add these to your Azure Functions environment variables:
QB_CLIENT_ID=your_client_id_here
QB_CLIENT_SECRET=your_client_secret_here
QB_REALM_ID=your_realm_id_here
QB_ENVIRONMENT=sandbox  # Change to 'production' when ready
```

---

## 🔵 Azure Keys (Optional - for Microsoft Login)

Only needed if you want users to log in with Microsoft accounts.

### Step 1: Create Azure AD App Registration

1. Go to: https://portal.azure.com
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **"New registration"**
4. Fill in:
   - **Name**: MIT QB Timesheet Frontend
   - **Redirect URI**: `https://rdsweet1.github.io/mit-qb-frontend`

5. After creation, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**

### Step 2: Add to GitHub Secrets

```bash
cd frontend
gh secret set NEXT_PUBLIC_AZURE_CLIENT_ID --body "your-client-id" --repo RDSweet1/mit-qb-frontend
gh secret set NEXT_PUBLIC_AZURE_TENANT_ID --body "your-tenant-id" --repo RDSweet1/mit-qb-frontend
```

---

## 📧 Email Keys (Optional - for notifications)

If you want to send email notifications:

1. Sign up at: https://resend.com
2. Get your API key
3. Add to backend environment:

```bash
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=timesheets@yourdomain.com
```

---

## 🎯 Quick Start Checklist

**Minimum to get started:**
- [x] Supabase credentials (already done)
- [ ] QuickBooks Client ID & Secret
- [ ] QuickBooks Realm ID

**Optional enhancements:**
- [ ] Azure AD credentials (Microsoft login)
- [ ] Resend API key (email notifications)

---

## 🔒 Security Notes

- ✅ GitHub Secrets are encrypted and not visible in logs
- ✅ Supabase anon key is safe to expose (public-facing)
- ⚠️ NEVER commit QB_CLIENT_SECRET to git
- ⚠️ Store backend secrets in Azure Key Vault for production

---

## 🚀 After Getting Keys

1. Add QuickBooks keys to your backend Azure Functions
2. Test OAuth flow: https://developer.intuit.com/app/developer/playground
3. Update secrets if needed: `gh secret set KEY_NAME --body "value"`
4. Deploy updates trigger automatically on push to main

---

**Questions?** Check the full deployment guide in `SETUP-GUIDE.md`
