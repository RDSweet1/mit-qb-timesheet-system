# Deploy Email Report Function

## Quick Deployment Instructions

### 1. Open Supabase Dashboard
- Go to: https://supabase.com/dashboard
- Select your MIT QB Timesheet project

### 2. Deploy Edge Function

**Navigate to Edge Functions:**
- Click **"Edge Functions"** in left sidebar
- Click **"Deploy a new function"**

**Create Function:**
- **Function Name:** `email_time_report`
- Click **"Create function"**

**Paste Code:**
Copy from: `C:\SourceCode\WeeklyTimeBillingQB\supabase\functions\email_time_report\index.ts`

Or copy from below:
```typescript
[See the full file content]
```

Click **"Deploy"**

### 3. Verify Environment Variables

**Go to Settings → Edge Functions:**
- Click on `email_time_report`
- Check these variables are set:
  - `AZURE_TENANT_ID` = aee0257d-3be3-45ae-806b-65c972c98dfb
  - `AZURE_CLIENT_ID` = 973b689d-d96c-4445-883b-739fff12330b
  - `AZURE_CLIENT_SECRET` = QVN8Q~iEZECKQhheQ_hPqpYR~pIJlWUZ3FtqGacs
  - `FROM_EMAIL` = timesheets@nextgenrestoration.com

(These should already be set project-wide)

### 4. Test Deployment

**Check Function Status:**
- Should show **"Active"** status
- Click **"Logs"** to watch for activity

**Test from Frontend:**
1. Open http://localhost:3000/time-entries-enhanced
2. Ensure some time entries are showing
3. Click **"Email Report"** button
4. Check logs for successful execution
5. Check email inbox

## Troubleshooting

**If email fails:**
1. Check Edge Function logs for errors
2. Verify Azure credentials are correct
3. Test Azure connection:
   ```bash
   curl -X POST https://login.microsoftonline.com/aee0257d-3be3-45ae-806b-65c972c98dfb/oauth2/v2.0/token \
     -d "client_id=973b689d-d96c-4445-883b-739fff12330p&client_secret=...&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"
   ```

**If function not deploying:**
1. Check for syntax errors in code
2. Ensure all imports are correct
3. Try deploying via CLI: `npx supabase functions deploy email_time_report`
