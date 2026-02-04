# Set Up Receipt Processor Scheduled Task

## Windows Task Scheduler Setup

### Step 1: Open Task Scheduler
1. Press `Win + R`
2. Type `taskschd.msc` and press Enter

### Step 2: Create New Task
1. Click **"Create Basic Task"** in the right panel
2. Name: `Email Receipt Processor`
3. Description: `Processes delivery and read receipts every 10 minutes`
4. Click **Next**

### Step 3: Set Trigger
1. Select **"Daily"**
2. Click **Next**
3. Start date: Today
4. Start time: 9:00 AM (or your business hours start)
5. Click **Next**

### Step 4: Set Action
1. Select **"Start a program"**
2. Click **Next**
3. Program/script: `powershell.exe`
4. Add arguments: `-ExecutionPolicy Bypass -File "C:\SourceCode\WeeklyTimeBillingQB\run-receipt-processor.ps1"`
5. Click **Next**

### Step 5: Set Repeat Interval
1. Check **"Open the Properties dialog for this task when I click Finish"**
2. Click **Finish**
3. In Properties dialog:
   - Go to **Triggers** tab
   - Double-click the trigger
   - Check **"Repeat task every:"**
   - Select: **10 minutes**
   - Duration: **1 day**
   - Check **"Enabled"**
   - Click **OK**

### Step 6: Configure Settings
1. Go to **Settings** tab
2. Check: **"Run task as soon as possible after a scheduled start is missed"**
3. Check: **"If the task fails, restart every:"** 1 minute, 3 attempts
4. Click **OK**

### Step 7: Test It
1. Right-click the task
2. Click **"Run"**
3. Check the log file: `C:\SourceCode\WeeklyTimeBillingQB\receipt-processor.log`

---

## Alternative: Run Manually

You can also run it manually anytime:

```powershell
cd C:\SourceCode\WeeklyTimeBillingQB
.\run-receipt-processor.ps1
```

---

## Monitoring

Check the log file regularly:
```powershell
Get-Content C:\SourceCode\WeeklyTimeBillingQB\receipt-processor.log -Tail 20
```

Or view in real-time:
```powershell
Get-Content C:\SourceCode\WeeklyTimeBillingQB\receipt-processor.log -Wait
```
