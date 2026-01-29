# 🚀 Deploy OAuth Pages to Vercel (5 Minutes)

## Quick Deploy Instructions

### **Option 1: Vercel Dashboard (Easiest - No CLI needed)**

1. **Open Vercel:** https://vercel.com/new

2. **Sign in** with one of:
   - GitHub account
   - GitLab account
   - Email address

3. **Deploy the folder:**
   - Click **"Browse"** or drag-and-drop
   - Select: `C:\SourceCode\WeeklyTimeBillingQB\oauth-pages`
   - Click **"Deploy"**

4. **Wait 30 seconds** - Vercel will build and deploy

5. **Copy your production URL:**
   ```
   Example: https://mit-qb-oauth-abc123.vercel.app
   ```

6. **Test all pages** (replace with your actual URL):
   - https://your-url.vercel.app/ ✓
   - https://your-url.vercel.app/eula ✓
   - https://your-url.vercel.app/connect ✓
   - https://your-url.vercel.app/disconnect ✓

---

### **Option 2: Command Line**

Open PowerShell in the project root:

```powershell
cd oauth-pages
npx vercel login
npx vercel --prod
```

Follow the prompts to authenticate and deploy.

---

## ✅ After Deployment

### **1. Save Your URLs**

Copy your Vercel deployment URL and create these URLs:

```
Host Domain:
your-project.vercel.app

EULA URL:
https://your-project.vercel.app/eula

Privacy Policy URL:
https://your-project.vercel.app/eula

Launch URL:
https://your-project.vercel.app/connect

Disconnect URL:
https://your-project.vercel.app/disconnect
```

---

### **2. Submit QuickBooks Production Approval**

1. Go to: https://developer.intuit.com/app/developer/myapps
2. Select your app: **MIT Consulting Timesheet System**
3. Click **"Production"** or **"Settings"**
4. Fill in the URLs above
5. Complete the **App Assessment Questionnaire**
6. Submit for review

**Expected approval time:** 24-48 hours

---

### **3. Return to Development**

Once submitted, come back and I'll have the Next.js frontend ready! 🎉

---

## Troubleshooting

**Issue:** "Folder not found"
- **Solution:** Use the full path: `C:\SourceCode\WeeklyTimeBillingQB\oauth-pages`

**Issue:** "Deployment failed"
- **Solution:** Check that all 4 HTML files exist (index, eula, connect, disconnect)

**Issue:** "404 on pages"
- **Solution:** The `vercel.json` file handles routing. Make sure it was uploaded.

---

## Need Help?

- **Vercel Docs:** https://vercel.com/docs/getting-started-with-vercel
- **Vercel Support:** https://vercel.com/support
- **Video Tutorial:** Search YouTube for "deploy static site to Vercel"

---

## ⏭️ What's Next?

After deploying and submitting the approval form, let me know and I'll continue building:

- ✅ OAuth pages deployed (DONE - You're doing this now)
- 🔄 QuickBooks approval submitted (Do this after deploy)
- 📦 Next.js frontend with Microsoft SSO (I'll build next)
- 🚀 Deploy frontend to Vercel (After frontend is built)
- ⚙️ Configure production automation (Cron jobs, email)
- ✅ End-to-end testing and documentation

**Come back after deployment and type:** "OAuth pages deployed - continue with frontend"
