# Azure App Configuration - Complete Guide

## Issue Identified
**Error:** "Sorry but we're having trouble - response type token is not enabled for the application"

**Root Cause:** Azure app registration doesn't have implicit grant flow enabled.

---

## Required Configuration

### Azure App Details
- **App Name:** QuickBooks Timesheet System
- **Client ID:** 973b689d-d96c-4445-883b-739fff12330b
- **Tenant ID:** aee0257d-3be3-45ae-806b-65c972c98dfb

---

## Configuration Steps

### 1. Enable Implicit Grant Tokens ⚠️ CRITICAL

**Portal URL:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/973b689d-d96c-4445-883b-739fff12330b

1. Navigate to **Authentication** page
2. Scroll to **"Implicit grant and hybrid flows"** section
3. Enable:
   - ☑️ **Access tokens (used for implicit flows)**
   - ☑️ **ID tokens (used for implicit and hybrid flows)**
4. Click **Save**

**This fixes the "response type token is not enabled" error.**

---

### 2. Add Redirect URIs

Still on the Authentication page:

1. Under **"Single-page application"**, click **"Add URI"**
2. Add these three URIs:
   ```
   https://rdsweet1.github.io/mit-qb-frontend/
   https://rdsweet1.github.io/mit-qb-frontend
   http://localhost:3000
   ```
3. Click **Save**

---

### 3. Add Mail Permissions (for Email Reports)

**Portal URL:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/973b689d-d96c-4445-883b-739fff12330b

1. Click **"API permissions"** in left sidebar
2. Click **"Add a permission"**
3. Click **"Microsoft Graph"**
4. Click **"Delegated permissions"**
5. Search for and add:
   - ☑️ `Mail.Send`
   - ☑️ `Mail.ReadWrite`
6. Click **"Add permissions"**
7. Click **"Grant admin consent for [your organization]"**
8. Click **"Yes"** to confirm

**Final permissions list should include:**
- ✅ User.Read
- ✅ email
- ✅ openid
- ✅ profile
- ✅ Mail.Send
- ✅ Mail.ReadWrite

---

## Updated Application Configuration

The frontend has been updated to request Mail permissions:

```typescript
export const loginRequest: PopupRequest = {
  scopes: [
    'User.Read',
    'email',
    'profile',
    'openid',
    'Mail.Send',       // NEW: Send emails
    'Mail.ReadWrite'   // NEW: Read/write emails
  ],
};
```

---

## Verification Steps

1. **Wait 2-3 minutes** for Azure changes to propagate
2. **Clear browser cache** (Ctrl+Shift+Del)
3. Go to: https://rdsweet1.github.io/mit-qb-frontend/
4. Click **"Sign in with Microsoft"**
5. **Expected:** Microsoft login popup opens
6. Sign in with your account
7. **First time:** You'll see a consent screen asking for Mail permissions
8. Click **"Accept"**
9. You'll be redirected to the dashboard
10. **Login will persist** on this computer (localStorage enabled)

---

## Troubleshooting

### Still getting "response type token is not enabled"
- Verify both checkboxes are enabled under "Implicit grant and hybrid flows"
- Wait 5 minutes and try again (Azure propagation delay)
- Clear browser cache completely

### "Redirect URI mismatch" error
- Verify all three redirect URIs are added exactly as shown
- Check for typos (especially trailing slash)

### "Admin approval required" for Mail permissions
- Click "Grant admin consent" button in API permissions page
- You must be an admin to grant consent
- Or have an admin grant consent for the organization

### Login works but can't send emails
- Check Mail.Send permission is granted
- Verify admin consent was granted
- Check application has delegated permissions (not application permissions)

---

## Testing Email Functionality

After configuration, test email sending:

```typescript
import { graphConfig } from '@/lib/authConfig';

// Get access token from MSAL
const accounts = instance.getAllAccounts();
const response = await instance.acquireTokenSilent({
  scopes: ['Mail.Send'],
  account: accounts[0]
});

// Send email via Microsoft Graph
const emailData = {
  message: {
    subject: "Test Email",
    body: {
      contentType: "HTML",
      content: "<h1>Test</h1>"
    },
    toRecipients: [
      {
        emailAddress: {
          address: "recipient@example.com"
        }
      }
    ]
  }
};

await fetch(graphConfig.graphMailEndpoint, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${response.accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(emailData)
});
```

---

## Summary Checklist

- [ ] Implicit grant tokens enabled (Access + ID tokens)
- [ ] Redirect URIs added (3 URIs)
- [ ] Mail permissions added (Mail.Send + Mail.ReadWrite)
- [ ] Admin consent granted
- [ ] Login tested and working
- [ ] Email permissions appear in consent screen
- [ ] Ready for Phase 2: Report Generation

---

## Next Phase: Report Generation

Once login + mail permissions are working:
1. Build weekly report generator (QuickBooks-style PDF)
2. Add "DO NOT PAY" header for informational reports
3. Implement email report functionality
4. Create monthly invoice workflow
