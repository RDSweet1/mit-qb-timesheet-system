# Azure Configuration - Quick Manual Steps

The automated script requires interactive authentication. Here's the fastest manual approach:

## 🚀 3-STEP QUICK FIX (5 minutes)

### Open This URL:
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/973b689d-d96c-4445-883b-739fff12330b

---

### STEP 1: Enable Implicit Grant (Fixes the error)

You'll see the **Authentication** page.

Scroll down to **"Implicit grant and hybrid flows"**

**CHECK BOTH BOXES:**
- ☑️ **Access tokens (used for implicit flows)**
- ☑️ **ID tokens (used for implicit and hybrid flows)**

Click **Save** at the top.

---

### STEP 2: Add Redirect URIs

Still on the same page, scroll to **"Single-page application"**

Click **"Add URI"** and add these THREE URIs:
1. `https://rdsweet1.github.io/mit-qb-frontend/`
2. `https://rdsweet1.github.io/mit-qb-frontend`
3. `http://localhost:3000`

Click **Save**.

---

### STEP 3: Add Mail Permissions

Click **"API permissions"** in the left sidebar

Click **"Add a permission"**
- Choose **"Microsoft Graph"**
- Choose **"Delegated permissions"**
- Search for "Mail.Send" and check it
- Search for "Mail.ReadWrite" and check it
- Click **"Add permissions"**

Click **"Grant admin consent for [your organization]"**
Click **"Yes"**

---

## ✅ Test Login

1. Wait 2 minutes
2. Go to: https://rdsweet1.github.io/mit-qb-frontend/
3. Click "Sign in with Microsoft"
4. **IT SHOULD WORK!**

---

## 📸 What You Should See

After clicking login:
1. Microsoft login popup opens ✓
2. Sign in with your account ✓
3. Consent screen asks for Mail permissions ✓
4. Click "Accept" ✓
5. Redirects to dashboard ✓
6. You're logged in! ✓

---

**Total time: 5 minutes**
**Then we can immediately build the report generation feature!**
