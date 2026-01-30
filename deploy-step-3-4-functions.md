# Steps 3 & 4: Deploy Edge Functions to Supabase

## 🎯 Objective
Deploy all 4 edge functions to Supabase and configure environment secrets.

## ⏱️ Time Required
15-20 minutes

---

## ✅ Prerequisites

- [x] Database schema deployed (Step 1)
- [x] Azure permissions configured (Step 2)
- [x] All Edge Functions code created

---

## 📦 What You're Deploying

| Function | Purpose |
|----------|---------|
| `sync-service-items` | Sync cost codes (with rates) from QuickBooks |
| `qb-time-sync` | Sync time entries from QuickBooks |
| `send-reminder` | Send weekly "DO NOT PAY" reports via Outlook |
| `create-invoices` | Create monthly invoices in QuickBooks |

---

## 📝 Step-by-Step Instructions

### Part A: Install Supabase CLI

**Option 1 - NPM (Recommended for Windows):**
```bash
npm install -g supabase
```

**Option 2 - Scoop (Windows package manager):**
```bash
scoop install supabase
```

**Verify Installation:**
```bash
supabase --version
```

---

### Part B: Login to Supabase

1. **Generate Access Token**
   - Go to: https://supabase.com/dashboard/account/tokens
   - Click **"Generate new token"**
   - Name it: "CLI Deployment"
   - Copy the token (you won't see it again!)

2. **Login via CLI**
```bash
supabase login
```
   - Paste your access token when prompted

---

### Part C: Link to Your Project

```bash
cd C:\SourceCode\WeeklyTimeBillingQB

supabase link --project-ref wppuhwrehjpsxjxqwsnr
```

**Expected Output:**
```
Linked to project wppuhwrehjpsxjxqwsnr
```

---

### Part D: Deploy Functions

Deploy all 4 functions:

```bash
# Deploy sync-service-items
supabase functions deploy sync-service-items

# Deploy qb-time-sync
supabase functions deploy qb-time-sync

# Deploy send-reminder
supabase functions deploy send-reminder

# Deploy create-invoices
supabase functions deploy create-invoices
```

**Expected Output for Each:**
```
Deployed Function sync-service-items on project wppuhwrehjpsxjxqwsnr
Function URL: https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/sync-service-items
```

---

### Part E: Set Environment Secrets

These secrets are shared across all functions:

```bash
# QuickBooks Credentials
supabase secrets set QB_CLIENT_ID=ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a
supabase secrets set QB_CLIENT_SECRET=O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU
supabase secrets set QB_REALM_ID=9341456256329564
supabase secrets set QB_ENVIRONMENT=sandbox

# Azure / Microsoft Outlook
supabase secrets set AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb
supabase secrets set AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b
supabase secrets set AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET_HERE

# QuickBooks Tokens (these will need to be refreshed periodically)
supabase secrets set QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..ImuEB5Zem2v7mQWmDi0L7g.DoT62xGqG8S7VQqVaZGBEK_kfrQpXDPxs_RUQa2-1P922z-H8PKEdS2sgxM34T4gINMZVSStmqpJBFC91hCkHXAtj1jVDhPQaV96CayA04PzCx7FzhLprBmPMo9HMOp8nLGcjoxiBfjTsASL9mpgCs3r_3JDVPL8UtuJqGBnvgQPIwS4VrOY7i-Lk0TDTiele4R2w9Le8Fl4Y9qQqZckrRkkHg6hT1UmDzqU1GX2lU8BwT8S-sItscveJDKhCtHR-2qEuVUN9LwpYWqVXde8LxEgQTiKl6WuOylbv1I56C8r9Vin9iaSOw8EJ5tm4TBiMA9xJ4kIKPdLeY_AyqkAS24fr3FIcHewzLBnjLw1w_n101c5mAVWt-efm0ktfqNsC-1TvF_3jDWlPhrJJm1nqkOQb61DFDLJDAlYpg4tuBEhjYAyCwiAmG-PTiqLz57HdNDtoSlb0wo9Hxc65ns2zJ8MLf02ULs5xQMyBODy5q_OYMAa4QO45DAASMxLLwVRdzS-28nj5s3qRwcFy3740-MDILVrExlv9FF3uA_-8AH_Qy7wwC9DJOrzyOCFCC0_lKr_qCvMmNPeNdD7Aj1h7Ib6HPBnt-5-7z6UGFhWHAeCc1ESM0mX5efYmL-HT7b6.a9Bd4B1oB4fStEkazhZ6-Q

supabase secrets set QB_REFRESH_TOKEN=RT1-222-IIb-17784204R0vt2sAmsl8ncvdklSa3zw
```

**Note:** Supabase may ask you to confirm each secret. Type 'y' and press Enter.

---

### Part F: Verify Deployment

```bash
# List deployed functions
supabase functions list
```

**Expected Output:**
```
sync-service-items    deployed
qb-time-sync          deployed
send-reminder         deployed
create-invoices       deployed
```

---

## ✅ Test Functions

### Test 1: Sync Service Items (Cost Codes)

```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/sync-service-items \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcHVod3JlaGpwc3hqeHF3c25yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQxMjQ2MSwiZXhwIjoyMDc4OTg4NDYxfQ.1s0zfM6u4YYsb1js1nKUGegQzDWiCZvq2m6CTchpdgg"
```

**Expected Result:**
```json
{
  "success": true,
  "synced": 5,
  "total": 5,
  "items": [...]
}
```

### Test 2: Sync Time Entries

```bash
curl -X POST https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/qb-time-sync \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcHVod3JlaGpwc3hqeHF3c25yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQxMjQ2MSwiZXhwIjoyMDc4OTg4NDYxfQ.1s0zfM6u4YYsb1js1nKUGegQzDWiCZvq2m6CTchpdgg" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2026-01-01", "endDate": "2026-01-31"}'
```

---

## ❌ Troubleshooting

### "supabase: command not found"
- **Solution:** NPM global install may not be in PATH. Try:
  ```bash
  npm install -g supabase --force
  ```
  Or restart your terminal.

### "Failed to deploy function"
- **Solution:** Check function logs:
  ```bash
  supabase functions logs sync-service-items
  ```

### "Invalid JWT" or auth errors
- **Solution:**
  1. Check your Supabase access token is correct
  2. Make sure you're linked to the right project
  3. Try logging out and back in:
     ```bash
     supabase logout
     supabase login
     ```

### Functions deployed but not working
- **Solution:**
  1. Check secrets are set correctly:
     ```bash
     supabase secrets list
     ```
  2. Check function logs for errors:
     ```bash
     supabase functions logs [function-name] --tail
     ```

---

## ✅ Completion Checklist

- [ ] Supabase CLI installed
- [ ] Logged into Supabase
- [ ] Linked to project wppuhwrehjpsxjxqwsnr
- [ ] Deployed all 4 functions
- [ ] Set all environment secrets
- [ ] Tested sync-service-items
- [ ] Tested qb-time-sync
- [ ] Verified data in Supabase Table Editor

**Once complete, proceed to Step 5: Test Backend, then Step 6: Create Frontend**

---

## 📊 Data Verification

After syncing, check in Supabase Dashboard → Table Editor:

1. **service_items table** - Should have 5+ rows with rates
2. **time_entries table** - Should have entries for January 2026 (if any exist in QB)
3. **customers table** - Should have customers who have time entries

---

## 🔗 Function URLs

All functions are deployed at:
- `https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/sync-service-items`
- `https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/qb-time-sync`
- `https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/send-reminder`
- `https://wppuhwrehjpsxjxqwsnr.supabase.co/functions/v1/create-invoices`

All require `Authorization: Bearer [SERVICE_ROLE_KEY]` header.
