# Configure Azure AD Redirect URI - REQUIRED FOR LOGIN

The "Sign in with Microsoft" button won't work until you add the redirect URI to your Azure app.

---

## 🔧 **Quick Fix (5 minutes):**

### **Step 1: Open Azure Portal**
Go to: https://portal.azure.com

### **Step 2: Navigate to Your App**
1. Search for "Azure Active Directory" or "Microsoft Entra ID"
2. Click **"App registrations"** in the left sidebar
3. Find your app: **"QuickBooks Timesheet System"**
4. Click on it

### **Step 3: Add Redirect URI**
1. Click **"Authentication"** in the left sidebar
2. Under **"Platform configurations"**, find **"Single-page application"** section
3. Click **"Add URI"** (or **"Add a platform"** → **"Single-page application"** if none exist)
4. Add this URL:
   ```
   https://rdsweet1.github.io/mit-qb-frontend/
   ```
5. **IMPORTANT:** Make sure it ends with a `/` (slash)

6. Also add localhost for testing:
   ```
   http://localhost:3000
   ```

7. Click **"Save"**

### **Step 4: Configure Token Settings**
Still on the Authentication page:

1. Scroll to **"Implicit grant and hybrid flows"**
2. ✅ Check **"Access tokens"**
3. ✅ Check **"ID tokens"**
4. Click **"Save"**

### **Step 5: Verify Permissions**
1. Click **"API permissions"** in the left sidebar
2. Ensure these are granted:
   - ✅ User.Read (Microsoft Graph)
   - ✅ email
   - ✅ openid
   - ✅ profile

If missing, click **"Add a permission"** → **"Microsoft Graph"** → **"Delegated permissions"** → Select them

3. Click **"Grant admin consent"** if you see that button

---

## 🧪 **Test It:**

1. Wait 2-3 minutes for Azure changes to propagate
2. Go to: https://rdsweet1.github.io/mit-qb-frontend/
3. Click **"Sign in with Microsoft"**
4. You should see Microsoft login popup
5. Sign in with your Microsoft account
6. You'll be redirected back to the dashboard

---

## 🔐 **Persistent Login:**

After signing in once:
- ✅ You'll stay logged in even after closing browser
- ✅ Login persists until you click "Sign Out"
- ✅ Works on the same computer automatically
- ✅ Other computers will need to sign in separately

---

## ❌ **Troubleshooting:**

### **"Redirect URI mismatch" error:**
- Make sure the URI in Azure **exactly matches**: `https://rdsweet1.github.io/mit-qb-frontend/`
- Include the trailing slash `/`

### **Nothing happens when clicking login:**
- Check browser console (F12) for errors
- Make sure popup blocker isn't blocking the login window
- Try a different browser

### **"AADSTS50011" error:**
- The redirect URI isn't configured correctly
- Double-check Azure Portal → App registrations → Authentication

---

## 📋 **Your Azure App Details:**

**App Name:** QuickBooks Timesheet System
**Client ID:** 973b689d-d96c-4445-883b-739fff12330b
**Tenant ID:** aee0257d-3be3-45ae-806b-65c972c98dfb

**Redirect URIs to Add:**
- https://rdsweet1.github.io/mit-qb-frontend/
- http://localhost:3000

---

**After configuring, the login should work immediately!**
