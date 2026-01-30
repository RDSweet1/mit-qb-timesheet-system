# Manual Login Test Plan

## Status: Azure Credentials NOW DEPLOYED ✅

The production site now has the correct Azure AD credentials embedded.

## Verified Deployment:
- ✅ Azure Client ID: `973b689d-d96c-4445-883b-739fff12330b`
- ✅ Azure Tenant ID: `aee0257d-3be3-45ae-806b-65c972c98dfb`
- ✅ Redirect URI: `https://rdsweet1.github.io/mit-qb-frontend`
- ✅ localStorage enabled for persistent login
- ✅ Deployed at: 2026-01-30 12:47 PM

## Next Step: Configure Azure Portal

The login will **NOT work** until you add the redirect URI in Azure Portal:

### Azure Portal Configuration (5 minutes):

1. Go to: https://portal.azure.com
2. Search for "Azure Active Directory" or "Microsoft Entra ID"
3. Click **"App registrations"** → Find **"QuickBooks Timesheet System"**
4. Click **"Authentication"** in left sidebar
5. Under **"Single-page application"**, click **"Add URI"**
6. Add BOTH these URIs:
   ```
   https://rdsweet1.github.io/mit-qb-frontend/
   https://rdsweet1.github.io/mit-qb-frontend
   ```
   (Note: Add both with and without trailing slash for maximum compatibility)

7. Click **"Save"**

### Enable Token Settings:
1. Still on Authentication page, scroll to **"Implicit grant and hybrid flows"**
2. ✅ Check **"Access tokens"**
3. ✅ Check **"ID tokens"**
4. Click **"Save"**

## Manual Test Procedure:

1. **Clear browser cache** (Ctrl+Shift+Del → Clear cached images and files)

2. Go to: https://rdsweet1.github.io/mit-qb-frontend/

3. You should see the login page with "Sign in with Microsoft" button

4. Click the button

5. **Expected Behavior:**
   - Microsoft login popup opens
   - You sign in with your Microsoft account
   - Popup closes
   - You're redirected to the dashboard

6. **If it fails:**
   - Open browser console (F12 → Console tab)
   - Click login button again
   - Look for errors containing:
     - "AADSTS50011" = Redirect URI not configured
     - "redirect_uri" = Mismatch between app and Azure Portal
     - "CORS" = Cross-origin issue
   - Screenshot the error and share

## Automated Test (When Playwright is working):

```bash
cd frontend
npx playwright test --ui
```

This will:
- Open the production site
- Click the login button
- Capture screenshots
- Detect if popup opens
- Log any console errors

## Troubleshooting:

### Error: "AADSTS50011: redirect_uri mismatch"
- Solution: Add both URIs (with and without trailing slash) in Azure Portal

### Error: "Popup blocked"
- Solution: Allow popups for rdsweet1.github.io in browser settings

### Nothing happens when clicking login
- Check browser console for JavaScript errors
- Verify Azure Client ID in deployed code:
  ```bash
  curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/static/chunks/app/layout-0285ca10d2e748b5.js" | grep "973b689d"
  ```

### Login works but doesn't persist
- localStorage should be enabled (already configured)
- Check browser privacy settings aren't blocking localStorage

## Security Notes:

- ✅ .env.production removed from git tracking
- ✅ GitHub secrets properly configured
- ✅ Root .env (with QB credentials) NEVER committed to git
- ✅ Azure Client/Tenant IDs are public (designed for browser use)
- ✅ Supabase anon key is public (designed for browser use)

## Next Phase (After Login Works):

1. Test time entries page with authentication
2. Implement "Generate Report" feature
3. Add email functionality with Microsoft Graph API
