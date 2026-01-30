# Step 2: Configure Azure Graph API Permissions

## 🎯 Objective
Add email sending permissions to your Azure App Registration so the system can send weekly reports via Microsoft Outlook.

## ⏱️ Time Required
5 minutes (+ 5 minutes wait for propagation)

---

## 📋 Current Status

**Your Azure App:**
- **Name:** Email Scrapper Azure App
- **Client ID:** 973b689d-d96c-4445-883b-739fff12330b
- **Tenant ID:** aee0257d-3be3-45ae-806b-65c972c98dfb

**Current Permissions:**
- ✅ Mail.Read (configured)
- ✅ User.Read.All (configured)

**Permissions Needed:**
- ⚠️ Mail.Send (need to add)
- ⚠️ Mail.Send.Shared (need to add)

---

## 📝 Step-by-Step Instructions

### Part A: Navigate to App Registration

1. **Open Azure Portal**
   - Go to: https://portal.azure.com
   - Sign in with your Microsoft account

2. **Find App Registrations**
   - In the search bar at top, type: **"App Registrations"**
   - Click **"App Registrations"** service

3. **Locate Your App**
   - In the list, search for Client ID: **973b689d-d96c-4445-883b-739fff12330b**
   - OR search for app name: **"Email Scrapper"**
   - Click on the app to open it

---

### Part B: Add Permissions

1. **Open API Permissions**
   - In the left sidebar, click **"API permissions"**
   - You should see existing permissions (Mail.Read, User.Read.All)

2. **Add New Permission**
   - Click **"+ Add a permission"** button
   - Click **"Microsoft Graph"**
   - Click **"Application permissions"** (NOT Delegated)

3. **Select Mail.Send**
   - In the search box, type: **"Mail.Send"**
   - Check the box next to: **Mail.Send**
   - Scroll down and check: **Mail.Send.Shared**
   - Click **"Add permissions"** at bottom

4. **Verify Permissions Added**
   - You should now see in the permissions list:
     - ✅ Mail.Read
     - ✅ Mail.Send (Not granted)
     - ✅ Mail.Send.Shared (Not granted)
     - ✅ User.Read.All

---

### Part C: Grant Admin Consent (CRITICAL)

**⚠️ THIS STEP IS REQUIRED - Permissions don't work without it!**

1. **Click Grant Consent Button**
   - Look for button: **"Grant admin consent for [Your Organization]"**
   - Click it

2. **Confirm**
   - A popup will ask: "Grant consent for the requested permissions for all accounts?"
   - Click **"Yes"**

3. **Verify Consent Granted**
   - After clicking Yes, the "Status" column should change:
     - Mail.Send: **"Granted for [Your Org]"** (green checkmark)
     - Mail.Send.Shared: **"Granted for [Your Org]"** (green checkmark)

---

### Part D: Wait for Propagation

**Important:** Azure takes 5-10 minutes to propagate new permissions.

- ☕ Take a break
- ⏰ Wait 5-10 minutes
- Then proceed to Step 3 (Edge Functions)

---

## ✅ Completion Checklist

- [ ] Found app registration in Azure Portal
- [ ] Added Mail.Send permission
- [ ] Added Mail.Send.Shared permission
- [ ] Clicked "Grant admin consent"
- [ ] Verified all permissions show "Granted" status
- [ ] Waited 5-10 minutes for propagation

**Once complete, proceed to Step 3: Create Edge Functions**
