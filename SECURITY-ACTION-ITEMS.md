# Security Action Items - REQUIRED

**Date:** January 31, 2026
**Status:** 🔴 ACTION REQUIRED

---

## What Happened

You mentioned that credentials were "saved back to GitHub's repository service." This is a security risk if sensitive tokens were committed.

## What I've Already Done ✅

1. **Removed committed credential file** (`update-qb-tokens.bat`)
2. **Updated .gitignore** to block all credential files
3. **Created safe template** (`update-qb-tokens.bat.example`)
4. **Created SECURITY.md** with best practices
5. **Committed security improvements** to git
6. **Verified credential files are gitignored**

## What YOU Need to Do Now

### CRITICAL - Within 24 Hours

#### 1. Revoke Supabase Personal Access Token ⚠️

The token `sbp_c8ec56e9b7d3161b9add4a34383e49ca1078fffd` should be revoked immediately.

**Steps:**
1. Go to: https://supabase.com/dashboard/account/tokens
2. Find the token (likely named "Update QB Secrets" or similar)
3. Click **"Revoke"**
4. Confirm revocation

**Why:** This token has full admin access to your Supabase project. If exposed, anyone could modify your database and Edge Function secrets.

#### 2. Push Security Commit to GitHub

```bash
cd /c/SourceCode/WeeklyTimeBillingQB
git push origin master
```

This will:
- Remove the old credential file from the main branch
- Add comprehensive .gitignore rules
- Publish SECURITY.md guidelines

**Note:** The old file will still exist in git history. If this is a public repo, see "Advanced Cleanup" below.

#### 3. Verify Protected Files Won't Be Committed

Run this to confirm:
```bash
cd /c/SourceCode/WeeklyTimeBillingQB
git status
```

You should see these files as **untracked** (not staged for commit):
- `set-secrets*.ps1`
- `update-fresh-tokens.ps1`
- `PASTE-INTO-SUPABASE.txt`
- `CORRECT-QB-CREDENTIALS.txt`
- `QB-SYNC-FIX-SUMMARY.md`

If any are staged (green), run:
```bash
git restore --staged filename
```

---

## Risk Assessment

### Low Risk ✅

Your `.env` file was **never committed** (properly gitignored from the start).

### Medium Risk ⚠️

The file `update-qb-tokens.bat` was committed with **OLD tokens** from a previous session. These tokens:
- Are likely expired/rotated
- Were from before we fixed the CLIENT credentials
- Probably don't work anymore

**BUT:** Still should be considered compromised.

### Unknown Risk ❓

It's unclear exactly what was "saved back to GitHub's repository service." If you:
- Committed the current `.env` file → HIGH RISK (contains current tokens)
- Committed any `set-secrets*.ps1` files → HIGH RISK (contains Supabase token)
- Just pushed existing commits → MEDIUM RISK (old tokens only)

---

## Advanced Cleanup (If Public Repo)

If your repository is **public on GitHub**, you should purge the old credential file from git history:

### Option 1: BFG Repo-Cleaner (Easiest)

```bash
# Download BFG
# Windows: Download from https://rtyley.github.io/bfg-repo-cleaner/
# Mac: brew install bfg

# Backup first!
cd /c/SourceCode
cp -r WeeklyTimeBillingQB WeeklyTimeBillingQB-backup

# Clean history
cd WeeklyTimeBillingQB
bfg --delete-files update-qb-tokens.bat

# Cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (⚠️ dangerous, make sure you have backup)
git push --force
```

### Option 2: git filter-repo (Recommended by GitHub)

```bash
# Install
pip install git-filter-repo

# Backup first!
cd /c/SourceCode
cp -r WeeklyTimeBillingQB WeeklyTimeBillingQB-backup

# Remove file from history
cd WeeklyTimeBillingQB
git filter-repo --path update-qb-tokens.bat --invert-paths

# Force push (⚠️ dangerous, make sure you have backup)
git push --force
```

### Option 3: Contact GitHub Support

For public repos with many collaborators:
1. Make repo **private** immediately
2. Email GitHub Support: support@github.com
3. Request cache purge for exposed secrets
4. Wait for confirmation before making public again

---

## If This Is a Private Repo

### Lower Urgency Actions

1. **Revoke Supabase token** (still important, but lower risk)
2. **Push security commit** to remove file from main branch
3. **Don't force push** (not necessary for private repos)
4. **Monitor for suspicious activity** in Supabase dashboard

### How to Check Repository Visibility

```bash
cd /c/SourceCode/WeeklyTimeBillingQB
git remote -v
```

Look at the URL:
- `github.com/username/repo.git` → Check GitHub settings
- Visit: https://github.com/username/repo/settings
- Look for "Danger Zone" → "Change repository visibility"

---

## Post-Cleanup Verification

After completing actions:

### 1. Verify Old Tokens Don't Work

The old tokens in the removed file should be invalid. Test:
```bash
# This should fail with 401 Unauthorized
curl -X POST "https://api.supabase.com/v1/projects/migcpasmtbdojqphqyzc/secrets" \
  -H "Authorization: Bearer sbp_c0133df1e3a3152c6e50103dd1159df921d85909" \
  -H "Content-Type: application/json" \
  -d '{"name":"TEST","value":"test"}'
```

**Expected:** Error (token invalid/revoked)

### 2. Verify Current Tokens Work

The new tokens should work fine:
```bash
curl -X POST "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-12-01","endDate":"2026-01-31"}'
```

**Expected:** Success (23 time entries synced)

### 3. Check GitHub Commit History

```bash
# View recent commits
git log --oneline -5

# Should see your security commit at the top
```

### 4. Verify .gitignore Working

```bash
# Try to add credential file (should fail)
git add PASTE-INTO-SUPABASE.txt

# Expected output:
# The following paths are ignored by one of your .gitignore files:
# PASTE-INTO-SUPABASE.txt
```

---

## Future Prevention

### Always Before Committing

```bash
# Review what you're committing
git status
git diff --staged

# Make sure NO .env, *secrets*, or token files are listed
```

### Install Pre-commit Hook

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
if git diff --cached --name-only | grep -E "\.env$|secret|token.*\.ps1"; then
    echo "❌ ERROR: Attempting to commit secrets!"
    exit 1
fi
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

### Use Git Aliases

Add to `~/.gitconfig`:
```ini
[alias]
    safe-status = !git status && echo "\n⚠️  Check for .env and secret files before committing!"
    safe-commit = !git diff --staged --name-only && read -p "Review staged files. Continue? (y/n) " -n 1 -r && echo && [[ $REPLY =~ ^[Yy]$ ]] && git commit
```

---

## Summary of Immediate Actions

- [ ] **Revoke Supabase personal access token** at https://supabase.com/dashboard/account/tokens
- [ ] **Push security commit to GitHub:** `git push origin master`
- [ ] **Verify credential files are gitignored:** `git status`
- [ ] (Optional) **Purge from git history** if public repo
- [ ] **Test that QB sync still works** (it should!)
- [ ] **Read SECURITY.md** for best practices going forward

---

## Questions?

If you're unsure about any of these steps or need help:
1. **Don't panic** - we've already mitigated most of the risk
2. **Check if repo is public or private** first
3. **Focus on revoking the Supabase token** (most critical)
4. **Push the security commit** to protect future commits

**The QuickBooks sync is still working fine!** These are just preventive security measures.

---

**Created:** January 31, 2026
**Status:** Awaiting user action
