# 🤖 Production Automation Guide

Complete setup for automated QuickBooks timesheet & billing operations.

---

## 📋 **Automated Tasks Overview**

| Task | Frequency | Time | Purpose |
|------|-----------|------|---------|
| **Time Entry Sync** | Daily | 8:00 AM EST | Sync time entries from QuickBooks |
| **Weekly Reports** | Weekly (Monday) | 9:00 AM EST | Email time summaries to clients |
| **Monthly Invoices** | Monthly (1st) | 10:00 AM EST | Create invoices in QuickBooks |
| **Token Refresh** | Every 30 min | Continuous | Keep OAuth tokens valid |
| **Log Cleanup** | Daily | 2:00 AM EST | Remove old logs |

---

## 🚀 **Setup Instructions**

### **Step 1: Deploy Cron Jobs Migration**

```bash
cd C:\SourceCode\WeeklyTimeBillingQB
npx supabase db push
```

This will deploy the migration file: `supabase/migrations/03_setup_cron_jobs.sql`

### **Step 2: Configure Supabase Secrets**

The cron jobs need access to the service role key. Set it in Supabase:

1. Go to: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/database
2. Click **Database Settings** > **Connection String**
3. Find your **Service Role Key** (starts with `eyJ...`)
4. Add as a database setting:

```sql
ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key-here';
```

### **Step 3: Verify Cron Jobs**

Query to see all scheduled jobs:

```sql
SELECT
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job
ORDER BY jobname;
```

Expected output: 5 jobs (daily-time-sync, weekly-reports, monthly-invoices, refresh-qb-tokens, cleanup-old-logs)

### **Step 4: Enable pg_net Extension**

For HTTP requests from cron jobs:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

## 📊 **Monitoring Automation**

### **View Recent Automation Logs**

```sql
SELECT
    job_name,
    status,
    started_at,
    completed_at,
    error_message,
    result
FROM automation_logs
ORDER BY created_at DESC
LIMIT 50;
```

### **View Cron Job Execution History**

```sql
SELECT
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 100;
```

### **Check for Failed Jobs**

```sql
SELECT *
FROM automation_logs
WHERE status = 'failure'
    AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## 🛠️ **Manual Job Execution**

To test a job manually:

### **Test Time Sync**

```bash
curl -X POST https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "sync", "days_back": 7}'
```

### **Test Weekly Reports**

```bash
curl -X POST https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/send-reminder \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"week_start": "2026-01-20", "week_end": "2026-01-26"}'
```

### **Test Monthly Invoices**

```bash
curl -X POST https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/create-invoices \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month": "2026-01", "auto_send": false}'
```

---

## ⚙️ **Modify Automation Schedules**

### **Change Schedule**

```sql
-- Update weekly reports to run on Fridays at 3 PM
SELECT cron.schedule(
    'weekly-reports',
    '0 15 * * 5',  -- 3 PM every Friday
    $$ [same command] $$
);
```

### **Disable a Job**

```sql
SELECT cron.unschedule('job-name');
```

### **Re-enable a Job**

Just run the `cron.schedule()` command again from the migration file.

---

## 🔔 **Alerts & Notifications**

### **Set Up Email Alerts for Failures**

Create an Edge Function to send alerts:

```typescript
// supabase/functions/alert-on-failure/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // Check for recent failures
  const failures = await supabase
    .from('automation_logs')
    .select('*')
    .eq('status', 'failure')
    .gt('created_at', new Date(Date.now() - 3600000).toISOString())

  if (failures.data && failures.data.length > 0) {
    // Send email alert via Microsoft Graph
    await sendEmailAlert(failures.data)
  }

  return new Response("OK")
})
```

Schedule this to run hourly:

```sql
SELECT cron.schedule(
    'failure-alerts',
    '0 * * * *',  -- Every hour
    $$ [call alert function] $$
);
```

---

## 📈 **Performance Optimization**

### **Index Optimization**

Already created in migration:
- `idx_automation_logs_job_name`
- `idx_automation_logs_created_at`

### **Partition Old Logs**

For large datasets, partition the automation_logs table by month:

```sql
-- Convert to partitioned table (advanced)
CREATE TABLE automation_logs_partitioned (
    LIKE automation_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE automation_logs_2026_01 PARTITION OF automation_logs_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Add more partitions as needed
```

---

## 🚨 **Troubleshooting**

### **Job Not Running**

1. **Check if pg_cron is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **Check if job exists:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'job-name';
   ```

3. **Check for errors:**
   ```sql
   SELECT * FROM cron.job_run_details WHERE jobid = YOUR_JOB_ID ORDER BY start_time DESC;
   ```

### **HTTP Requests Failing**

1. **Verify pg_net is installed:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

2. **Check Edge Function logs in Supabase Dashboard**

3. **Verify service role key is set:**
   ```sql
   SHOW app.supabase_service_role_key;
   ```

### **QuickBooks Token Expired**

If token refresh fails:
1. Manually reconnect to QuickBooks via the frontend
2. Check `qb_tokens` table for valid tokens
3. Verify the refresh-qb-tokens job is running

---

## 📝 **Automation Checklist**

- [ ] Deploy cron jobs migration
- [ ] Configure Supabase service role key
- [ ] Enable pg_net extension
- [ ] Test each job manually
- [ ] Verify jobs appear in `cron.job` table
- [ ] Monitor logs for 24 hours
- [ ] Set up failure alerts
- [ ] Document custom schedule changes

---

## 🎯 **Next Steps**

1. **Deploy the automation:** `npx supabase db push`
2. **Test manual execution** of each job
3. **Wait 24 hours** and check automation_logs
4. **Set up monitoring dashboard** (optional)
5. **Configure alerts** for critical failures

---

## 📞 **Support**

For issues with automation:
- Check Supabase logs: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/logs
- Review cron job history: Query `cron.job_run_details`
- Contact: accounting@mitigationconsulting.com

---

**Automation Setup Complete!** 🎉
