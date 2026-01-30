# 🚀 QuickBooks Production Activation Guide

**Congratulations!** Your app has been approved for production access.

---

## ✅ Step 1: Production Credentials (DONE!)

Your .env file has been updated with production credentials:

```
QB_CLIENT_ID=ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUOe0FPO
QB_CLIENT_SECRET=NEsyhDb1g5nficOBremLWqhqSyfwvOLlhkrSBLye
QB_ENVIRONMENT=production
```

---

## 🔑 Step 2: Get Production OAuth Tokens

**IMPORTANT:** Sandbox tokens don't work in production. You need new tokens from your REAL QuickBooks account.

### Option A: OAuth Playground (Quick Test)

1. **Go to:** https://developer.intuit.com/app/developer/playground

2. **Select your app** from the dropdown

3. **Ensure "Production" is selected** (not Sandbox)

4. **Click "Get OAuth 2.0 Token"**

5. **Sign in** with your REAL QuickBooks Online account
   - Use the QuickBooks account with your company data
   - NOT a sandbox account

6. **Copy the tokens:**
   ```bash
   Access Token: eyJencr...
   Refresh Token: AB1234...
   Realm ID: 9341456256329564  # Your company ID
   ```

7. **Update .env file:**
   ```bash
   QB_ACCESS_TOKEN=<paste access token>
   QB_REFRESH_TOKEN=<paste refresh token>
   QB_REALM_ID=<your realm ID>
   ```

### Option B: Production OAuth Flow (Recommended)

1. **Deploy your Supabase function** with production credentials

2. **Visit your connect-qb endpoint:**
   ```
   https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/connect-qb
   ```

3. **Click "Connect to QuickBooks Online"**

4. **Authorize with your real QuickBooks account**

5. **Tokens will be automatically stored**

---

## 🧪 Step 3: Test Production Connection

### Test 1: Verify Credentials
```bash
cd /c/SourceCode/WeeklyTimeBillingQB
npm run test:qb
```

Expected output:
```
✓ Company Info retrieved
✓ Production environment confirmed
✓ Realm ID: 9341456256329564
```

### Test 2: Fetch Real Data
```bash
# Test time entries sync
curl -X POST https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync \
  -H "Authorization: Bearer YOUR_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2026-01-01", "endDate": "2026-01-31"}'
```

---

## 📋 Step 4: Deploy to Azure Functions

Your backend needs production credentials in Azure:

### 4.1: Update Azure Environment Variables

1. **Go to:** https://portal.azure.com

2. **Navigate to:** Your Function App → Configuration → Application settings

3. **Add/Update these settings:**
   ```
   QB_CLIENT_ID=ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUOe0FPO
   QB_CLIENT_SECRET=NEsyhDb1g5nficOBremLWqhqSyfwvOLlhkrSBLye
   QB_ENVIRONMENT=production
   QB_REALM_ID=9341456256329564
   ```

4. **Click "Save"**

### 4.2: Store Tokens in Azure Key Vault (Recommended)

```bash
# Add tokens to Key Vault
az keyvault secret set --vault-name <your-vault> --name "QB-ACCESS-TOKEN" --value "<token>"
az keyvault secret set --vault-name <your-vault> --name "QB-REFRESH-TOKEN" --value "<token>"
```

---

## ⚠️ Important Security Notes

1. **NEVER commit production tokens to git**
   - .env file is already in .gitignore
   - Use environment variables or Key Vault

2. **Token Expiration:**
   - Access tokens expire after 1 hour
   - Refresh tokens expire after 100 days
   - Implement automatic token refresh

3. **Production vs Sandbox:**
   - Production uses REAL customer data
   - Test thoroughly before rolling out
   - Keep sandbox credentials for testing

---

## 🔄 Step 5: Set Up Automatic Token Refresh

Your app should automatically refresh tokens. Verify this works:

1. **Wait 1 hour** for access token to expire

2. **Make an API call** - should auto-refresh

3. **Check logs** for: "Access token expired, refreshing..."

4. **Verify new tokens** are saved to storage

---

## 📊 Step 6: Verify Data Sync

### Test with Real Data:

1. **Add time entries** in QuickBooks Workforce

2. **Run sync:**
   ```bash
   # Via your frontend
   https://rdsweet1.github.io/mit-qb-frontend/
   ```

3. **Check Supabase** for synced data:
   ```sql
   SELECT * FROM time_entries
   WHERE synced_at > NOW() - INTERVAL '1 hour'
   ORDER BY synced_at DESC;
   ```

4. **Generate a report** to verify formatting

5. **Create an invoice** to verify QB integration

---

## ✅ Production Checklist

- [ ] Production credentials added to .env
- [ ] New OAuth tokens obtained from real QB account
- [ ] Connection test successful
- [ ] Azure Functions updated with production config
- [ ] Tokens stored in Azure Key Vault
- [ ] Auto-refresh tested and working
- [ ] Real data sync tested
- [ ] Invoice creation tested
- [ ] Email reports tested
- [ ] User access configured
- [ ] Monitoring/alerts set up

---

## 🆘 Troubleshooting

### "Invalid client credentials"
- Verify you copied the PRODUCTION credentials (not sandbox)
- Check for extra spaces in Client ID/Secret

### "Invalid token"
- Get fresh tokens from OAuth Playground
- Ensure you're using PRODUCTION tokens (not sandbox)
- Check QB_ENVIRONMENT=production

### "Realm ID not found"
- Ensure Realm ID matches your production QuickBooks company
- Get Realm ID from OAuth Playground response

### "401 Unauthorized"
- Access token expired - should auto-refresh
- Check refresh token is valid
- Verify auto-refresh logic is working

---

## 📞 Support

**QuickBooks Developer Support:**
- Portal: https://developer.intuit.com/app/developer/dashboard
- Docs: https://developer.intuit.com/app/developer/qbo/docs

**Your Support:**
- Email: accounting@mitigationconsulting.com
- Phone: 813-962-6855

---

## 🎯 Next Steps

1. **Get production OAuth tokens** (Step 2 above)
2. **Test the connection** (Step 3)
3. **Deploy to Azure** (Step 4)
4. **Verify data sync** (Step 6)
5. **Train your users**
6. **Go live!** 🚀

---

**Status:** Production credentials configured, awaiting OAuth tokens

**Last Updated:** January 30, 2026
