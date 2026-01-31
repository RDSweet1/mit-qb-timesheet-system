# Security Guidelines

## NEVER Commit These to Git

### Credentials and Secrets
- `.env` files
- Supabase personal access tokens (start with `sbp_`)
- QuickBooks OAuth tokens (ACCESS_TOKEN, REFRESH_TOKEN)
- Azure client secrets
- Supabase service role keys
- Any file ending in `-secrets.ps1` or `-secrets.bat`

### Files That Are Gitignored
The following patterns are automatically ignored:
- `*.env`
- `*-secrets*.ps1`
- `*-secrets*.bat`
- `set-secrets*.ps1`
- `update-*-tokens*.ps1`
- `update-*-tokens*.bat`
- `PASTE-INTO-SUPABASE.txt`
- `CORRECT-QB-CREDENTIALS.txt`

## What Can Be Committed Safely

✅ **Safe to commit:**
- `.env.example` (template with placeholder values)
- `*.bat.example` (template scripts with placeholders)
- Documentation files (README, setup guides)
- Source code files (.ts, .tsx, .js, etc.)
- Configuration files without secrets (next.config.js, package.json)

## If Credentials Were Committed

### Immediate Actions

1. **Revoke ALL exposed credentials immediately:**
   - Supabase personal access tokens: https://supabase.com/dashboard/account/tokens
   - QuickBooks tokens: Regenerate via OAuth Playground
   - Azure secrets: Rotate in Azure Portal

2. **Remove from git history:**
   ```bash
   # Remove specific file
   git rm --cached filename
   git commit -m "Remove sensitive file"
   git push

   # Or use git-filter-repo to purge from entire history
   git filter-repo --path filename --invert-paths
   ```

3. **Add to .gitignore:**
   ```bash
   echo "filename" >> .gitignore
   git add .gitignore
   git commit -m "Add sensitive files to gitignore"
   git push
   ```

## Token Management Best Practices

### Supabase Personal Access Tokens
- **Only create when needed** for specific tasks
- **Revoke immediately** after use
- **Never store** in files that might be committed
- **Use environment variables** for scripts

### QuickBooks OAuth Tokens
- **Access tokens** expire in 1 hour (auto-refresh handled by Edge Functions)
- **Refresh tokens** expire in 101 days
- **Stored in Supabase Edge Function secrets** (not in .env)
- **Use OAuth Playground** to regenerate when expired

### How to Update Secrets Securely

#### Method 1: Supabase CLI (Recommended)
```bash
npx supabase secrets set QB_ACCESS_TOKEN=xxx --project-ref migcpasmtbdojqphqyzc
```

#### Method 2: PowerShell Script (for bulk updates)
1. Copy template: `cp update-fresh-tokens.ps1.example update-fresh-tokens.ps1`
2. Edit with your tokens (file is gitignored)
3. Run: `powershell -ExecutionPolicy Bypass -File update-fresh-tokens.ps1`
4. Delete the file when done

#### Method 3: Supabase Dashboard
- Go to: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/secrets
- Manually add/update secrets
- **Note:** This method has occasionally failed; prefer CLI or API

## Environment Variable Hierarchy

### Local Development (.env)
Contains ALL credentials for local testing:
- QuickBooks CLIENT_ID and CLIENT_SECRET
- Supabase URL and keys
- Azure credentials

**Status:** Gitignored ✅

### Supabase Edge Function Secrets
Contains credentials needed by serverless functions:
- QB_CLIENT_ID
- QB_CLIENT_SECRET
- QB_ACCESS_TOKEN
- QB_REFRESH_TOKEN
- QB_REALM_ID
- QB_ENVIRONMENT

**How to update:** Use Supabase CLI or Management API

### Frontend Environment Variables
Contains public, non-sensitive configuration:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY (safe to expose)
- NEXT_PUBLIC_AZURE_CLIENT_ID
- NEXT_PUBLIC_REDIRECT_URI

**Status:** Can be committed ✅ (public values only)

## Checking for Leaked Secrets

### Before Committing
```bash
# Check what's staged
git diff --staged

# Review specific file
git diff --staged filename

# Make sure .env is NOT listed
git status
```

### After Committing (but before pushing)
```bash
# Check last commit
git show HEAD

# Undo last commit (keep changes)
git reset HEAD~1
```

### After Pushing to GitHub
1. **Immediately revoke** all exposed credentials
2. **Contact GitHub Support** to purge from cache
3. **Force push** cleaned history (⚠️ dangerous for shared repos)
4. **Rotate all secrets** to new values

## Recommended Tools

### GitGuardian
- Free browser extension
- Scans commits for secrets
- https://www.gitguardian.com/

### git-secrets
- AWS tool to prevent committing secrets
- Install: `brew install git-secrets` (Mac) or https://github.com/awslabs/git-secrets
- Setup: `git secrets --install` in your repo

### Pre-commit Hooks
Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
if git diff --cached --name-only | grep -E "\.env$|secrets"; then
    echo "❌ ERROR: Attempting to commit secret files!"
    echo "Files blocked:"
    git diff --cached --name-only | grep -E "\.env$|secrets"
    exit 1
fi
```

## Recovery Checklist

If you accidentally committed secrets:

- [ ] Revoke Supabase personal access token
- [ ] Regenerate QuickBooks OAuth tokens
- [ ] Rotate Azure client secrets
- [ ] Remove file from git (git rm)
- [ ] Add to .gitignore
- [ ] Commit and push changes
- [ ] Verify credentials are working with new values
- [ ] Document what happened (for learning)

## Questions?

If unsure whether something contains secrets:
- **When in doubt, DON'T commit it**
- Review with `git diff --staged` first
- Use `.example` template files instead
- Store real values in gitignored files

---

**Remember:** Once committed to GitHub, secrets should be considered compromised forever, even if deleted. Prevention is key!
