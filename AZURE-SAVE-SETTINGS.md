# CRITICAL: Azure Portal Settings Must Be Saved

## Problem
The "Sign in with Microsoft" button does nothing because the Azure Portal implicit grant settings haven't been saved yet.

## Solution

### Go Back to Azure Portal Settings Tab

URL: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/973b689d-d96c-4445-883b-739fff12330b

1. Click on the **"Settings"** tab
2. Verify both checkboxes are checked:
   - ☑️ Access tokens (used for implicit flows)
   - ☑️ ID tokens (used for implicit and hybrid flows)
3. Scroll ALL THE WAY to the bottom
4. Click **"Save"** button

### If Save Button is Greyed Out

The settings might already be saved! In that case:

1. Try **unchecking one checkbox**, then **checking it again**
2. This will enable the Save button
3. Then click Save

### After Saving

1. Wait 2-3 minutes for Azure to propagate changes
2. Clear browser cache (Ctrl+Shift+Del)
3. Go to: https://rdsweet1.github.io/mit-qb-frontend/
4. Try login again

### How to Verify Settings Are Active

After saving and waiting 2-3 minutes, the login button should:
- Open a Microsoft login popup when clicked
- NOT show "response type token is not enabled" error

## Alternative: Use Old Authentication Experience

If the new (Preview) experience has issues saving:

1. On the Authentication page, look for the blue notice that says:
   "Welcome to the new and improved experience for authentication. To switch to the old experience, please click here."

2. Click "click here" to switch to the old experience

3. In the old experience:
   - Scroll to "Implicit grant"
   - Check both boxes
   - Click Save at top

4. Scroll to "Redirect URIs"
   - Add the URIs under "Single-page application" platform
   - Click Save

## Current Status

✅ Code deployed correctly (verified)
✅ Azure credentials in production bundle (verified)
✅ Mail permissions in scopes (verified)
❌ Implicit grant settings NOT ACTIVE (preventing login)

## What's Blocking Login

Without the implicit grant settings saved in Azure Portal:
- MSAL cannot request tokens using implicit flow
- Login button click handler fails silently
- No popup opens
- JavaScript errors occur (11 errors visible in console)

## Next Steps

1. Save the Azure Portal settings
2. Wait 2-3 minutes
3. Clear browser cache
4. Test login again
5. Login should work!
