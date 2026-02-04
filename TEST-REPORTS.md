# Testing Report Functions

## ✅ Test Checklist

- [ ] Generate Report (CSV Download)
- [ ] Email Report Function Deployed
- [ ] Email Report Sends Successfully
- [ ] Email Received with Correct Data
- [ ] CSV Contains Correct Data

---

## 🧪 TEST 1: Generate Report (CSV Download)

This should work immediately - no deployment needed!

### Steps:

1. **Open Frontend:**
   - Go to: http://localhost:3000/time-entries-enhanced
   - Login if needed

2. **Set Date Range:**
   - Click **"Last Month"** (should show January 2026 data)
   - Verify you see time entries (should show 186 entries)

3. **Click Generate Report:**
   - Click the green **"Generate Report"** button
   - Should immediately download a CSV file
   - Check Downloads folder for: `time_entries_2026-01-01_to_2026-01-31.csv`

4. **Verify CSV Contents:**
   - Open the CSV in Excel or text editor
   - Should have these columns:
     ```
     Date,Employee,Customer,Cost Code,Start Time,End Time,Hours,Billable,Status,Notes
     ```
   - Should have 186 data rows (one per entry)
   - Dates should be formatted: MM/DD/YYYY
   - Times should be formatted: H:MM AM/PM
   - Notes should be properly escaped

5. **Expected Result:**
   ```
   ✅ File downloads automatically
   ✅ Opens in Excel without errors
   ✅ All 186 entries present
   ✅ Data is readable and properly formatted
   ✅ No missing fields
   ```

### Troubleshooting:

**Button Disabled / Grayed Out:**
- Means no entries in date range
- Try different date filter
- Run QB Time sync first

**No Download Happening:**
- Check browser console (F12) for errors
- Check browser settings allow downloads
- Try different browser

**CSV Won't Open in Excel:**
- File may be corrupted
- Check browser console for errors
- Try regenerating

---

## 🧪 TEST 2: Email Report

Requires edge function deployment first!

### Prerequisites:

1. **Deploy Edge Function:**
   - See DEPLOY-EMAIL-REPORT.md for instructions
   - Or use: `npx supabase functions deploy email_time_report`

2. **Verify Azure Credentials:**
   ```bash
   # Check .env file has these:
   AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb
   AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b
   AZURE_CLIENT_SECRET=QVN8Q~iEZECKQhheQ_hPqpYR~pIJlWUZ3FtqGacs
   FROM_EMAIL=timesheets@nextgenrestoration.com
   ```

### Test from Command Line First:

```bash
# Quick test of edge function
node test-email-report.js
```

**Expected Output:**
```
🧪 Testing Email Report Function...
📧 Sending test report to: david@mitigationconsulting.com

Status: 200 OK

📊 Response:
{
  "success": true,
  "message": "Report emailed to david@mitigationconsulting.com"
}

✅ SUCCESS! Email sent.
📬 Check inbox for: david@mitigationconsulting.com
```

**If This Fails:**
- Check Supabase Edge Function logs
- Verify function is deployed and active
- Check Azure credentials are correct
- Test Azure auth manually (see troubleshooting below)

### Test from Frontend:

1. **Open Frontend:**
   - http://localhost:3000/time-entries-enhanced

2. **Set Date Range:**
   - Click **"Last Month"**
   - Verify entries showing

3. **Click Email Report:**
   - Click blue **"Email Report"** button
   - Should see loading state (if implemented)
   - Watch for success/error message

4. **Check Email:**
   - Open your email inbox
   - Look for: "Time Entry Report: 2026-01-01 to 2026-01-31"
   - From: timesheets@nextgenrestoration.com

5. **Verify Email Contents:**
   ```
   ✅ Subject line correct
   ✅ Period dates shown in header
   ✅ Summary section shows totals
   ✅ Entries grouped by customer
   ✅ Each customer has subtitle
   ✅ Tables formatted correctly
   ✅ Billable status color-coded
   ✅ All data accurate
   ```

### Email Preview Example:

```
┌────────────────────────────────────────────┐
│ Time Entry Report                          │
│ Period: 01/01/2026 to 01/31/2026          │
└────────────────────────────────────────────┘

Summary
  Total Entries: 186
  Total Hours: 511.2 hrs

Entries by Customer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Susag TB

┌────────────┬─────────────┬───────────┬───────┬──────────┐
│ Date       │ Employee    │ Cost Code │ Hours │ Billable │
├────────────┼─────────────┼───────────┼───────┼──────────┤
│ 01/30/2026 │ Netausha    │ SA2AT     │ 3.15  │ Billable │
│ 01/29/2026 │ Annalee     │ SA2AT     │ 2.50  │ Billable │
├────────────┴─────────────┴───────────┼───────┼──────────┤
│                          Subtotal:   │ 54.1  │          │
└──────────────────────────────────────┴───────┴──────────┘
```

---

## 🔧 Troubleshooting

### Generate Report Issues

**Button disabled:**
```javascript
// Check browser console:
// Should show: "No entries to report"
```
**Solution:** Sync QB Time data or change date filter

**Download not working:**
```javascript
// Browser console may show:
// "Blob is not defined" or "URL.createObjectURL failed"
```
**Solution:** Try different browser (Chrome/Edge recommended)

**CSV has weird characters:**
- File encoding issue
- Open with UTF-8 encoding
- Or import into Excel using "Data → From Text/CSV"

### Email Report Issues

**Function not found (404):**
```
Error: Function 'email_time_report' not found
```
**Solution:** Deploy the edge function first

**Authentication failed (401):**
```
Error: Failed to get access token
```
**Solution:** Check Azure credentials in Supabase dashboard

**Email not received:**
1. Check spam/junk folder
2. Verify recipient email is correct
3. Check Supabase function logs for errors
4. Verify FROM_EMAIL has permission to send

**Azure Auth Test:**
```bash
# Test Azure authentication manually
curl -X POST "https://login.microsoftonline.com/aee0257d-3be3-45ae-806b-65c972c98dfb/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=973b689d-d96c-4445-883b-739fff12330b" \
  -d "client_secret=YOUR_SECRET" \
  -d "scope=https://graph.microsoft.com/.default" \
  -d "grant_type=client_credentials"

# Should return JSON with access_token
```

**Check Supabase Logs:**
```
Supabase Dashboard → Edge Functions → email_time_report → Logs
```

Look for:
- ✅ "Email sent successfully"
- ❌ "Failed to get access token"
- ❌ "Failed to send email"

---

## 📊 Success Criteria

### Generate Report (CSV):
- ✅ Button clickable when entries present
- ✅ File downloads immediately
- ✅ Filename includes date range
- ✅ CSV opens in Excel without errors
- ✅ All entries present in file
- ✅ Data properly formatted
- ✅ No missing or corrupt data

### Email Report:
- ✅ Edge function deployed successfully
- ✅ Button clickable when entries present
- ✅ Success message appears
- ✅ Email received within 1 minute
- ✅ Email formatted correctly
- ✅ All data accurate
- ✅ Professional appearance
- ✅ Grouped by customer
- ✅ Subtotals correct

---

## 🎯 Next Steps After Testing

If both tests pass:
- ✅ Report features are working!
- ✅ Ready for production use
- ✅ Can generate reports for any date range
- ✅ Can email reports to stakeholders

If tests fail:
- Review troubleshooting section above
- Check browser/Supabase logs
- Verify all prerequisites met
- Run test scripts for debugging

---

## 💡 Usage Tips

**Generate Report:**
- Best for Excel analysis
- Can filter by customer/employee first
- Date range affects filename
- Keep CSVs for record keeping

**Email Report:**
- Best for weekly/monthly summaries
- Professional format for clients
- Automatically groups by customer
- Saved in Sent Items for records

**Workflow:**
1. Filter to desired date range
2. Generate CSV for detailed analysis
3. Email report for management review
4. Adjust filters as needed
5. Repeat for different customers/periods
