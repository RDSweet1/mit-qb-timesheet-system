# View Tracking History Guide

## 📜 How to View Full Tracking Timeline

### What is Tracking History?
The tracking history shows **every action** taken on a time entry:
- When it was approved (and by whom)
- When it was sent to the customer
- When it was delivered
- When it was read (or declined)
- Any edits or changes

---

## 🔍 Accessing History

### From Time Entries Page:
1. Navigate to: http://localhost:3001/time-entries-enhanced
2. Find any time entry
3. Look for the **"History"** button next to the status badges
4. Click **"History"**
5. Dialog opens with full timeline

---

## 📊 What You'll See

### Timeline Format:
The history shows events in **reverse chronological order** (newest first):

```
┌─────────────────────────────────────────────┐
│ 📖 Read by Customer                         │
│ customer@example.com                        │
│ Feb 4, 2026, 2:45 PM                       │
└─────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────┐
│ 📬 Delivered                                │
│ customer@example.com                        │
│ Feb 4, 2026, 2:32 PM                       │
└─────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────┐
│ 📧 Sent to Customer                         │
│ david@mitigationconsulting.com              │
│ Feb 4, 2026, 9:15 AM                       │
└─────────────────────────────────────────────┘
         ↑
┌─────────────────────────────────────────────┐
│ ✅ Approved                                 │
│ david@mitigationconsulting.com              │
│ Feb 4, 2026, 9:15 AM                       │
└─────────────────────────────────────────────┘
```

---

## 🏷️ Event Types

### ✅ Approved
- **Who**: The person who approved (e.g., Sharon or David)
- **When**: Timestamp of approval
- **Details**:
  - Method: bulk_approve or individual
  - Number of entries approved

### 📧 Sent to Customer
- **Who**: System (accounting@mitigationconsulting.com)
- **When**: Email send timestamp
- **Details**:
  - Recipient email
  - Message ID (for tracking)
  - Customer ID

### 📬 Delivered
- **Who**: Recipient's email server
- **When**: Delivery confirmation timestamp
- **Details**:
  - Receipt subject line
  - Receipt message ID

### 📖 Read by Customer
- **Who**: Customer email address
- **When**: When customer opened the email
- **Details**:
  - Receipt subject line
  - Receipt message ID
  - Proof they read it!

### ❌ Read Receipt Declined
- **Who**: Customer email address
- **When**: When customer received email
- **Details**:
  - They got the email but declined to confirm reading
  - Still counts as received

### 🔓 Unlocked / 🔒 Locked
- **Who**: Person who locked/unlocked
- **When**: Lock/unlock timestamp
- **Details**: Reason for unlock (if provided)

### ✏️ Edited
- **Who**: Person who edited
- **When**: Edit timestamp
- **Details**:
  - Old values
  - New values
  - What changed

---

## 🕐 Timeline Interpretation

### Typical Flow (Successful):
```
9:00 AM  - ✅ Approved by Sharon
9:00 AM  - 📧 Sent to Customer (auto-send)
9:15 AM  - 📬 Delivered (customer received)
2:30 PM  - 📖 Read by Customer (customer opened)
```

### Declined Receipt:
```
9:00 AM  - ✅ Approved by Sharon
9:00 AM  - 📧 Sent to Customer
9:15 AM  - 📬 Delivered
9:16 AM  - ❌ Read Receipt Declined
```
**Meaning**: Customer got the email but chose not to send read confirmation.

### Still Pending Delivery:
```
9:00 AM  - ✅ Approved by Sharon
9:00 AM  - 📧 Sent to Customer
(waiting for receipt processor to run)
```
**Action**: Wait 10-15 minutes, run receipt processor

---

## 🔍 View Details

Each event has a **"View Details"** expandable section:

Click to see:
- Full JSON of event data
- Message IDs for email tracking
- Method used (bulk vs individual)
- Any additional metadata

---

## 📊 Using History for Billing Disputes

### Proof of Delivery:
1. Customer claims they never got the timesheet
2. Open History dialog
3. Show **📬 Delivered** event with timestamp
4. Screenshot for records

### Proof of Receipt:
1. Customer claims they never saw the charges
2. Open History dialog
3. Show **📖 Read by Customer** with timestamp
4. Proof they opened the email!

### Audit Trail:
- Who approved what, when
- Complete chain of custody
- Timestamps are legally defensible

---

## 🎯 Best Practices

### Weekly Review:
1. Monday: Send timesheets
2. Tuesday: Check histories to confirm delivery
3. Wednesday: Follow up on undelivered

### Before Invoicing:
1. Check all entries have **📬 Delivered** or **📖 Read** status
2. Document any declined receipts
3. Follow up with customers who haven't opened

### For Disputes:
1. Export audit log (future feature)
2. Take screenshots of history
3. Document delivery timestamps

---

## 🔧 Troubleshooting

### "No tracking history available"
**Reason**: Entry hasn't been approved yet
**Fix**: Only approved entries have tracking history

### History shows only "Approved" and "Sent"
**Reason**: Receipt processor hasn't run yet
**Fix**:
1. Wait 10-15 minutes after sending
2. Run: `.\run-receipt-processor.ps1`
3. Refresh page and check again

### Delivered but not Read (after several days)
**Possible reasons**:
- Customer hasn't opened the email
- Email in spam folder
- Customer declined read receipt
- Email client doesn't support read receipts

**Action**: Follow up with customer directly

---

## 📞 Customer Says They Didn't Get It

### Check History:
1. Open History dialog
2. Look for **📬 Delivered** event
3. If present: They got it!
4. If not: Check spam, resend

### If Declined Receipt:
- Customer received email
- Chose not to confirm reading
- This is normal and expected
- They still got the timesheet

### If Truly Not Delivered:
- History shows only **📧 Sent**
- No delivery receipt after 24+ hours
- Email may be invalid
- Try alternative contact method
