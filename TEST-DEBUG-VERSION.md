# Test Debug Version - Login Troubleshooting

## ✅ Debug Code Deployed
The production site now has comprehensive logging to identify the login issue.

## 🧪 How to Test

1. **Open the site:**
   https://rdsweet1.github.io/mit-qb-frontend/

2. **Open Developer Console:**
   - Press `F12` or right-click → "Inspect"
   - Go to the "Console" tab
   - **CLEAR the console** (click the 🚫 clear icon)

3. **Refresh the page:**
   - Press `Ctrl+R` or F5
   - Watch the console for debug messages

4. **Click "Sign in with Microsoft"**
   - Watch what happens in the console

## 🔍 What to Look For

### When Page Loads:
You should see these messages:
```
🔍 DEBUG: Environment Variables: { clientId: "973b689d...", tenantId: "aee0257d...", redirectUri: "https://..." }
🔍 DEBUG: MSAL Config: { auth: {...}, cache: {...} }
✅ DEBUG: MSAL instance created successfully
🔍 DEBUG: Home component mounted/updated
🔍 DEBUG: Is authenticated: false
```

### When You Click the Button:
You should see:
```
🔍 DEBUG: handleLogin called - button clicked!
🔍 DEBUG: MSAL instance: [object]
🔍 DEBUG: Calling loginPopup...
```

Then EITHER:
- ✅ `✅ DEBUG: Login successful!` (popup opened)
- ❌ `❌ DEBUG: Login failed with error:` (shows the error)

## 📸 Take Screenshots

Take screenshots showing:
1. The debug messages when page loads
2. The debug messages when you click the button
3. Any red error messages

## 🚨 Common Issues to Check:

### Issue 1: Environment Variables Missing
```
clientId: undefined
tenantId: undefined
```
**Fix:** GitHub secrets not configured properly

### Issue 2: MSAL Initialization Failed
```
❌ DEBUG: Failed to create MSAL instance: [error]
```
**Fix:** Configuration problem

### Issue 3: Button Click Not Firing
If you click but see NO debug messages:
- JavaScript file not loading
- Browser cached old version (clear cache: Ctrl+Shift+Del)

### Issue 4: Popup Blocked
```
❌ DEBUG: Error name: BrowserAuthError
❌ DEBUG: Error message: popup_window_error
```
**Fix:** Allow popups for this site

### Issue 5: Azure Configuration Issue
```
❌ DEBUG: Error code: AADSTS50011
❌ DEBUG: Error description: redirect_uri_mismatch
```
**Fix:** Azure Portal redirect URIs not saved correctly

---

## 📋 Send Me:
1. Screenshot of console when page loads
2. Screenshot of console when you click the button
3. Any error messages you see

This will tell me EXACTLY what's wrong!
