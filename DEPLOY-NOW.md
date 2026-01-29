# 🚀 DEPLOY NOW - Quick Start

## You Have 2 Things to Deploy:

### ✅ **1. OAuth Pages (for QuickBooks approval)**
**Status:** Ready to deploy
**Time:** 2 minutes

### ✅ **2. Frontend Application (main system)**
**Status:** Ready to deploy
**Time:** 5 minutes

---

## 📋 **Deployment Order (Recommended)**

### **STEP 1: Deploy OAuth Pages First** ⭐

This unblocks the QuickBooks production approval submission.

```bash
.\deploy-oauth-to-vercel.bat
```

**Then:**
1. Copy the OAuth pages URL (e.g., `https://mit-qb-oauth.vercel.app`)
2. Open `DEPLOY-OAUTH-NOW.md` for submission instructions
3. Submit QuickBooks production approval form
4. *(Approval takes 24-48 hours - continue to Step 2 while waiting)*

---

### **STEP 2: Deploy Frontend Application**

```bash
.\deploy-frontend-to-vercel.bat
```

**Follow the prompts to:**
1. Login to Vercel (browser opens)
2. Deploy to production
3. Copy production URL
4. Set environment variables (instructions provided)
5. Update Azure AD redirect URI

**Full instructions:** `DEPLOY-FRONTEND-GUIDE.md`

---

## 🎯 **Ready to Deploy?**

Run these commands:

```bash
# Deploy OAuth pages
.\deploy-oauth-to-vercel.bat

# Deploy Frontend  
.\deploy-frontend-to-vercel.bat
```

---

**Let's deploy! 🚀**
