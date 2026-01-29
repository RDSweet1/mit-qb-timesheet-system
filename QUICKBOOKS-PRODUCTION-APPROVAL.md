# QuickBooks Production App Approval Checklist

**Complete this form to get production API keys from Intuit**

---

## 🚀 STEP 1: Deploy OAuth Pages to Vercel

Run this command:
```bash
.\deploy-oauth-to-vercel.bat
```

This deploys 4 static pages to Vercel:
- ✅ Home page
- ✅ EULA / Privacy Policy
- ✅ Launch URL (OAuth connection)
- ✅ Disconnect URL

**IMPORTANT:** Copy the Vercel URL from the deployment output. You'll need it for Step 2.

Example output:
```
Production: https://mit-qb-oauth.vercel.app
```

---

## 📝 STEP 2: Fill Out Production App Form

Go to: https://developer.intuit.com/app/developer/myapps

### Select your app, then go to "Production" settings

---

## 🔗 REQUIRED URLs

Replace `[YOUR-VERCEL-URL]` with your actual Vercel deployment URL from Step 1.

**Host Domain:**
```
[YOUR-VERCEL-URL].vercel.app
```

**EULA URL:**
```
https://[YOUR-VERCEL-URL].vercel.app/eula
```

**Privacy Policy URL:**
```
https://[YOUR-VERCEL-URL].vercel.app/eula
```

**Launch URL:**
```
https://[YOUR-VERCEL-URL].vercel.app/connect
```

**Disconnect URL:**
```
https://[YOUR-VERCEL-URL].vercel.app/disconnect
```

**Redirect URI:** (OAuth callback - should already be configured)
```
https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl
```

---

## 📂 APP CATEGORY

Select ONE:
- ☑️ **Accounting & Finance**
- OR: **Time Tracking**

---

## 🌍 HOSTING & COMPLIANCE

**Where is your app hosted?**
```
Supabase (AWS US-East-1, Virginia)
PostgreSQL database + Deno Edge Functions
```

**Does your app operate in regulated industries?**
```
☐ No
```

---

## 📋 APP ASSESSMENT QUESTIONNAIRE

### **Section 1: App Information (5 questions)**

**Q1: Which of the following is true about your app?**
```
☑️ I used another platform/tool to build my app (Supabase)
```

**Q2: What API platforms does your app use?**
```
QuickBooks Online API for timesheet and invoice data
```

**Q3: How does your app interact with data?**
```
- Read: Time entries, customers, service items, employees
- Write: Invoices to QuickBooks
```

**Q4: Will you make your app publicly available?**
```
☐ No - This is a private app for internal use only by MIT Consulting
Expected users: 3-5 MIT Consulting staff members
```

**Q5: Which QuickBooks Online user types can access your application?**
```
Company administrators only (for OAuth authorization)
```

**Q6: Does your app integrate with other platforms?**
```
Yes: Microsoft Azure (for email via Outlook/Graph API)
```

---

### **Section 2: Authorization and Authentication (7 questions)**

**Q1: Have you tested connecting, disconnecting, and reconnecting in sandbox?**
```
☑️ Yes
```

**Q2: How often does your app refresh tokens?**
```
☑️ Only when access tokens expire (1-hour expiration)
Automatic refresh logic implemented
```

**Q3: Does your app retry failed authorization requests?**
```
☑️ Yes, with exponential backoff
```

**Q4: Do you prompt customers to reconnect after authorization errors?**
```
☑️ Yes (implemented in frontend dashboard)
```

**Q5: Do you use Intuit's discovery document for OAuth 2.0 endpoints?**
```
☑️ Yes, using standard OAuth 2.0 endpoints from Intuit documentation
```

**Q6: Can your app handle authorization errors?**
```
☑️ Yes, handles:
- Expired access tokens (auto-refresh)
- Invalid grant errors
- CSRF token validation
```

**Q7: Does your app rely on OAuth Playground?**
```
☐ No - OAuth Playground used only for initial token generation
```

---

### **Section 3: API Usage (2 questions)**

**Q1: Which API categories does your app use?**
```
☑️ Accounting API only
☐ NOT using Payments or Payroll APIs
```

**Q2: How frequently does your app poll QuickBooks APIs?**
```
- Daily sync at 3:00 AM (time entries, customers, service items)
- Weekly reports on Mondays at 8:00 AM
- Monthly invoicing (manual trigger)
```

---

### **Section 4: Accounting API (5 questions)**

**Q1: Which QuickBooks Online versions does your app support?**
```
☑️ Simple Start
☑️ Essentials
☑️ Plus
☑️ Advanced
```

**Q2: Can your app handle version-specific feature changes?**
```
☑️ Yes - App uses core features available in all versions
```

**Q3: Have you tested multi-currency and sales tax features?**
```
☑️ N/A - App only reads/writes time entries and invoices in USD
No currency conversion or tax calculations
```

**Q4: Does your app use webhooks?**
```
☐ No - Using scheduled polling instead
```

**Q5: Does your app use Change Data Capture (CDC)?**
```
☑️ Yes, using syncToken fields to detect changes
Polling frequency: Daily at 3:00 AM
```

---

### **Section 5: Error Handling (4 questions)**

**Q1: Have you tested API error scenarios?**
```
☑️ Yes, tested:
- Syntax errors
- Validation errors (400)
- Rate limiting (429)
- Authentication failures (401)
```

**Q2: Does your app capture the intuit_tid field from response headers?**
```
☑️ Yes, logged for troubleshooting
```

**Q3: Does your app maintain error logs?**
```
☑️ Yes, using Supabase logging and Deno console logs
```

**Q4: How do customers get support?**
```
Internal app: Email accounting@mitigationconsulting.com
Support provided by MIT Consulting IT team
```

---

### **Section 6: Security (7 questions)**

**Q1: Has your organization experienced security breaches in the past 12 months?**
```
☐ No
```

**Q2: Does your organization conduct regular security assessments?**
```
☑️ Yes, following best practices for OAuth 2.0 and API security
```

**Q3: Are credentials stored securely?**
```
☑️ Yes:
- No hardcoded credentials
- Environment secrets stored in Supabase Secrets Manager
- Not exposed in browser logs or client-side code
```

**Q4: Does your app implement multi-factor authentication?**
```
☑️ Yes:
- Frontend Access: Microsoft Entra ID (Azure AD) SSO
- QuickBooks OAuth: Intuit's MFA
```

**Q5: Does your app use Captcha?**
```
☐ No - Not needed for internal app with SSO authentication
```

**Q6: Does your app use WebSockets?**
```
☐ No
```

**Q7: Do you share customer data with third parties?**
```
☐ No - Data is only used internally by MIT Consulting
Never shared, sold, or disclosed to third parties
```

---

## ✅ VERIFICATION CHECKLIST

Before submitting, verify:

- ✅ All 3 OAuth pages deployed and accessible
- ✅ EULA URL loads correctly
- ✅ Launch URL displays connection page
- ✅ Disconnect URL displays disconnect confirmation
- ✅ All URLs copied exactly (no typos)
- ✅ App category selected
- ✅ Hosting location specified
- ✅ All 30 questionnaire questions answered
- ✅ Test in sandbox completed

---

## ⏱️ TIMELINE

**After submission:**
- Intuit reviews your application
- Most apps approved in **24-48 hours**
- If additional info needed, Intuit will email you

**What happens after approval:**
- Production keys unlocked in Developer Portal
- Update `.env` with production tokens
- Run `.\update-qb-tokens.bat` to update Supabase secrets
- Switch `QB_ENVIRONMENT=production` in `.env`

---

## 📞 NEED HELP?

**Intuit Developer Support:**
- https://help.developer.intuit.com/s/

**MIT Consulting IT:**
- Email: accounting@mitigationconsulting.com
- Phone: 813-962-6855
- Accounting: 717-377-6447

---

## 🎯 QUICK LINKS

- **Developer Portal:** https://developer.intuit.com/app/developer/myapps
- **OAuth Playground:** https://developer.intuit.com/app/developer/playground
- **API Documentation:** https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice

---

**Ready to submit!** All information is complete and accurate.
