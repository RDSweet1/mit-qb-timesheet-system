# QuickBooks Production App Setup - Quick Reference

## 📝 Intuit Developer Portal Answers

Use these exact values when filling out the QuickBooks production approval form:

---

### ✅ Step 1: Review Profile and Verify Email
- Already completed ✓

---

### ✅ Step 2: End-User License Agreement and Privacy Policy

**End-user license agreement URL:**
```
https://rdsweet1.github.io/mit-qb-frontend/terms
```

**Privacy policy URL:**
```
https://rdsweet1.github.io/mit-qb-frontend/privacy
```

Both pages are live and verified ✓

---

### ✅ Step 3: Host Domain, Launch URL, and Disconnect URL

**Host Domain:**
```
rdsweet1.github.io
```

**Launch URL:**
```
https://rdsweet1.github.io/mit-qb-frontend/
```

**Disconnect URL:**
```
https://rdsweet1.github.io/mit-qb-frontend/
```

**Redirect URI (OAuth callback):**
```
https://rdsweet1.github.io/mit-qb-frontend/oauth-callback
```

---

### ✅ Step 4: Select Category

**Primary Category:** Time Tracking

**Secondary Category (optional):** Accounting & Bookkeeping

---

### ✅ Step 5: Regulated Industries

**Answer:** None

(Select "No" or leave unchecked unless you're in healthcare, finance, or other regulated industries)

---

### ✅ Step 6: Where is Your App Hosted?

**Hosting Type:** Cloud/Web-based application

**Platform:** GitHub Pages (Static Site Hosting)

**Alternative answer:** You can say "Vercel" or "Cloud-hosted web application"

---

## 🎯 After Submission

Once Intuit approves your app (usually 1-2 business days):

1. **Switch to Production Mode**
   ```bash
   # Update .env file:
   QB_ENVIRONMENT=production
   ```

2. **Get Production Tokens**
   - Visit: https://developer.intuit.com/app/developer/playground
   - Use your production Client ID
   - Authorize with your real QuickBooks account
   - Copy the production tokens to your .env file

3. **Update Azure Functions**
   - Deploy production tokens to Azure Key Vault
   - Update environment variables in Azure portal

4. **Test Production OAuth Flow**
   - Visit your app
   - Click "Connect to QuickBooks"
   - Authorize with production account
   - Verify data sync works

---

## 📋 Current Setup Summary

**App Name:** MIT QuickBooks Timesheet & Billing System

**Client ID:** ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a

**Current Environment:** Sandbox

**Frontend URL:** https://rdsweet1.github.io/mit-qb-frontend/

**Scope Requested:** `com.intuit.quickbooks.accounting`

**What This Allows:**
- ✓ Read/Write Time Activities
- ✓ Read/Write Customers
- ✓ Read/Write Invoices
- ✓ Read/Write Service Items
- ✓ Read/Write Payments
- ✓ Read Company Info

---

## 🔒 Security Notes

- Privacy Policy and Terms pages are publicly accessible (as required)
- OAuth tokens are stored securely in Azure Key Vault
- Never commit production tokens to git
- Use environment variables for all sensitive data

---

## 📞 Support Contact

If Intuit has questions during review:

**Email:** accounting@mitigationconsulting.com
**Phone:** 813-962-6855
**Company:** MIT Consulting, Tampa, FL

---

## ✨ Next Steps After Approval

1. [ ] Switch QB_ENVIRONMENT to production
2. [ ] Get production OAuth tokens
3. [ ] Update Azure Functions configuration
4. [ ] Test with real QuickBooks data
5. [ ] Train users on the system
6. [ ] Set up automated token refresh

---

**Document Updated:** January 29, 2026
**Status:** Ready for Production Approval Submission
