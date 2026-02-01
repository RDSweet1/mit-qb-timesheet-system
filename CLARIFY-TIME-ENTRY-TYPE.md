# Clarification: Time Entry Type

## Quick Check Needed

I've opened QuickBooks Online Time Activity page. Please check one of your December 2025 time entries:

### Question 1: How was the time entered?

Look at any time entry from December. Does it show:

**Option A - Duration Entry (Lump Sum):**
```
Employee: Fred Ferraiuolo
Date: 12/31/2025
Duration: 1h 44m
```

**Option B - Start/End Time Entry:**
```
Employee: Fred Ferraiuolo
Date: 12/31/2025
Start Time: 9:15 AM
End Time: 10:59 AM
Duration: 1h 44m (calculated)
```

### Question 2: When creating a new time entry in QB Online

When you click "+ New Time Entry", do you see:
- Just a duration field (hours/minutes)?
- OR separate start time and end time fields?

---

## What This Means

### If Option A (Duration Only)
- Time entries were entered as lump sum
- **No start/end times exist anywhere**
- Database showing "lump sum" is correct
- Display is working as intended ✅

### If Option B (Start/End Times)
- QB Online DOES have the times
- Our sync function isn't capturing them
- Need to fix the sync to extract start/end
- Times should be in QB API response

---

## My Current Understanding

Based on your answers:
- You said "qtime is where it lives until it is billed"
- But you don't use QuickBooks Time (separate product)
- So you might have meant "time entries live in QB until billed"

**Possible confusion:**
- "QB Time" = QuickBooks Time product (formerly TSheets) ❌ You don't use this
- "Time in QB" = Time entries in QuickBooks Online ✅ This is what you use

---

## Next Steps Depend on Your Answer

**If you see start/end times in QB Online:**
→ I'll fix the sync to capture them from QB Online API

**If you only see duration:**
→ System is working correctly, data is lump sum
→ We can add UI feature to let users ENTER start/end times manually if needed

Please check QB Online and let me know what you see!
