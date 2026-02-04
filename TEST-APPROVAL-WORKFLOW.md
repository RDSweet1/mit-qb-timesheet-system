# Test Approval Workflow - Step by Step

## 🧪 Complete End-to-End Test

### Prerequisites
- Frontend running on http://localhost:3001
- Customer has a valid email in the system
- You have time entries from last week

---

## Step 1: Open the App
1. Navigate to: **http://localhost:3001/time-entries-enhanced**
2. Login with Microsoft account if prompted
3. Should see time entries page

---

## Step 2: Filter Last Week's Data
1. Click **"Last Week"** date preset button
2. Verify entries load (should see checkbox column)
3. Check that you have some entries

---

## Step 3: Select a Specific Customer
1. In the **Customer** dropdown, select a specific customer
   - **Important**: Must have a customer with a valid email!
   - If no email, add it in QuickBooks first
2. Verify entries for that customer are displayed
3. Check the **"Email to Insured"** button - should show customer's email

---

## Step 4: Review Time Entries
1. Look at each entry:
   - ☑️ Checkbox visible
   - 🏷️ Status badge showing **"⏳ Pending"** (yellow)
   - Employee name, hours, cost code visible
   - Description showing work details
2. Verify all data is accurate

---

## Step 5: Approve Entries

**Option A: Approve Selected**
1. Check boxes next to 2-3 entries
2. Notice button shows: **"Approve Selected (3)"**
3. Click the button
4. Wait 2-5 seconds

**Option B: Approve All**
1. Click **"Approve All Pending"** button
2. Wait 5-10 seconds (processes all entries)

---

## Step 6: Watch Status Changes
You should see status badges update:
1. **⏳ Pending** → **✅ Approved** (green) - Instant
2. **✅ Approved** → **📧 Sent** (blue) - Within 2-3 seconds
3. Success message: **"✅ Approved N entries and sent to customer!"**

---

## Step 7: Verify Email Sent

**Check Customer's Inbox:**
1. Open the customer's email
2. Look for: **"Time Entry Report: [date] to [date]"**
3. Email should contain:
   - ✅ Date range
   - ✅ Table with entries (Date, Employee, Cost Code, **Description**, Hours, Billable)
   - ✅ Grouped by customer
   - ✅ Total hours summary

**Email Headers (Advanced):**
- From: accounting@mitigationconsulting.com
- Subject: Time Entry Report: YYYY-MM-DD to YYYY-MM-DD
- Read receipt requested: Yes
- Delivery receipt requested: Yes

---

## Step 8: View Tracking History
1. Click the **"History"** button next to an entry
2. Dialog should open showing timeline:
   - ✅ **Approved** - Who approved, when
   - 📧 **Sent to Customer** - Recipient email, when
   - (Later) 📬 **Delivered** - When customer received
   - (Later) 📖 **Read** - When customer opened

---

## Step 9: Process Receipts (Wait 10-15 minutes)

**After customer receives the email:**

1. Run receipt processor manually:
   ```powershell
   cd C:\SourceCode\WeeklyTimeBillingQB
   .\run-receipt-processor.ps1
   ```

2. Check output:
   - Should show: "Processed: N receipts"
   - Delivery: 1 (if delivered)
   - Read: 1 (if customer opened it)

3. **Refresh the time entries page**
4. Check status badges:
   - Should now show **📬 Delivered** (if received)
   - Or **📖 Read** (if opened)

5. Click **"History"** button again:
   - Should now show delivery/read events
   - With timestamps

---

## Step 10: Test Declined Receipt (Optional)

If customer declines read receipt:
1. Status stays at **📬 Delivered**
2. History shows: **"❌ Read Receipt Declined"**
3. Entry has `read_receipt_declined = true` flag

---

## 🎯 Expected Results

### Successful Test Shows:
- ✅ Entries approved successfully
- ✅ Email sent automatically
- ✅ Customer received email with timesheet
- ✅ Status badges update in real-time
- ✅ History dialog shows full timeline
- ✅ Delivery/read receipts processed (after 10+ min)

### Database Should Contain:
- ✅ `time_entries.approval_status` = 'sent', 'delivered', or 'read'
- ✅ `time_entries.sent_at` = timestamp
- ✅ `email_tracking` record with message_id
- ✅ `approval_audit_log` entries for each action

---

## 🐛 Troubleshooting

### Issue: "No email for customer"
**Fix**: Add email in QuickBooks Online for that customer

### Issue: Status stuck at "Sent"
**Fix**: Run receipt processor: `.\run-receipt-processor.ps1`

### Issue: Email not received
**Check**:
1. Spam folder
2. Customer email is correct
3. Check email_tracking table for errors

### Issue: History button shows "No tracking history"
**Reason**: Entry hasn't been approved yet (only pending entries)

---

## 📊 Verify in Database (Advanced)

```sql
-- Check tracking record
SELECT * FROM email_tracking
WHERE sent_at > NOW() - INTERVAL '1 day'
ORDER BY sent_at DESC;

-- Check audit log
SELECT * FROM approval_audit_log
WHERE performed_at > NOW() - INTERVAL '1 day'
ORDER BY performed_at DESC;

-- Check entry status
SELECT id, employee_name, approval_status, sent_at, delivered_at, read_at
FROM time_entries
WHERE approval_status != 'pending'
ORDER BY sent_at DESC
LIMIT 10;
```
