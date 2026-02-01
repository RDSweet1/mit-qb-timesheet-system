# Interface Design Plan - Weekly Reports & Monthly Invoicing
**Based on:** Weekly client updates + Monthly billing workflow

---

## 🎯 PRIMARY USE CASE: Weekly Client Progress Reports

### Report Requirements:

**Purpose:** Keep clients informed of work performed on their behalf

**Frequency:** Weekly

**Grouping:** By Customer → Customer:Job

**Sorting:** By Date & Time (chronological) - DEFAULT
- Alternative sorts: By Employee, By Cost Code (user can toggle)

**Data to Display:**
1. ✅ Employee name (who did the work)
2. ✅ Date (when it was performed)
3. ✅ Start/Stop times (clock in/out if available)
4. ✅ Duration (hours and minutes)
5. ✅ Cost code (service type/billing category)
6. ✅ Description (what was done)
7. ✅ Notes (additional details)
8. ❓ Rate/Amount? (Show $ for transparency or hide for weekly?)

**Header:** "DO NOT PAY - WEEKLY PROGRESS REPORT"

---

## 📱 INTERFACE LAYOUT

### Main Screen: Time Entry Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  QuickBooks Time & Billing - Weekly Reports                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [📅 Date Range: This Week ▼] [🔄 Sync from QB]            │
│                                                              │
│  Filters:                                                    │
│  [👥 Customer: All ▼] [👤 Employee: All ▼]                 │
│  [💼 Cost Code: All ▼] [⚡ Status: Billable ▼]              │
│                                                              │
│  Group by: [Customer ▼]                                     │
│  Sort by:  (•) Date/Time  ( ) Employee  ( ) Cost Code       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▼ ACME Corporation - Fire Damage Project           │   │
│  │                                          22.5 hours │   │
│  │                                                      │   │
│  │   ┌─ David Sweet ────────────────────────────────┐  │   │
│  │   │ Mon Jan 27  9:00 AM - 5:00 PM  8.0 hrs       │  │   │
│  │   │ Expert Witness - Deposition                   │  │   │
│  │   │ Reviewed fire scene photos and timeline       │  │   │
│  │   │ Notes: Client meeting scheduled for Friday    │  │   │
│  │   └───────────────────────────────────────────────┘  │   │
│  │                                                      │   │
│  │   ┌─ Sharon Kisner ─────────────────────────────┐   │   │
│  │   │ Mon Jan 27  10:00 AM - 3:30 PM  5.5 hrs      │   │
│  │   │ Administrative                                │   │
│  │   │ Prepared deposition materials                 │   │
│  │   │ Notes: Exhibits organized by timeline         │   │
│  │   └───────────────────────────────────────────────┘  │   │
│  │                                                      │   │
│  │   [+ More entries...]                                │   │
│  │                                                      │   │
│  │   [📊 Generate Weekly Report] [📧 Email Report]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ▼ XYZ Insurance - Water Damage Investigation       15.0 hrs│
│  [Collapsed - click to expand]                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                    │
│  [☑️ Select All] [📄 Create Monthly Invoice]                │
│  [📤 Export to Excel]                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗓️ DATE RANGE PICKER

### Quick Filters (Most Important):
```
┌─────────────────────────────────┐
│ 📅 Select Date Range            │
├─────────────────────────────────┤
│ Quick Filters:                  │
│  • This Week (Mon-Sun)          │ ← Default for weekly reports
│  • Last Week                    │
│  • This Month                   │ ← For monthly invoicing
│  • Last Month                   │
│  • Custom Range...              │
├─────────────────────────────────┤
│ Custom Range:                   │
│  From: [Jan 20, 2026]           │
│  To:   [Jan 26, 2026]           │
│  [Apply]                        │
└─────────────────────────────────┘
```

**Implementation:**
- ShadCN DateRangePicker component
- Default: Current week (Monday to Sunday)
- "This Month" for monthly invoice generation

---

## 📊 WEEKLY REPORT FORMAT

### Option A: QuickBooks-Style Detail Report

**Matches QB "Time by Customer Detail" report format**

```
═══════════════════════════════════════════════════════════════
                  WEEKLY PROGRESS REPORT
                     DO NOT PAY
             For: ACME Corporation
           Period: January 20-26, 2026
═══════════════════════════════════════════════════════════════

ACME Corporation - Fire Damage Project
───────────────────────────────────────────────────────────────

Date          Time              Duration  Employee        Service Item
────────────  ────────────────  ────────  ──────────────  ─────────────────
Mon Jan 20    9:00 AM-5:00 PM   8.0 hrs   David Sweet     Expert Witness
              Description: Reviewed fire scene photos and timeline analysis
              Notes: Client meeting scheduled for Friday to review findings

Mon Jan 20    10:00 AM-3:30 PM  5.5 hrs   Sharon Kisner   Administrative
              Description: Prepared deposition materials and exhibits
              Notes: Exhibits organized chronologically

Tue Jan 21    9:00 AM-12:30 PM  3.5 hrs   David Sweet     Pre-Trial Prep
              Description: Prepared expert witness testimony outline
              Notes: Cross-referenced with scene photos

Tue Jan 21    1:00 PM-4:00 PM   3.0 hrs   Sharon Kisner   Administrative
              Description: Client correspondence and document filing
              Notes: Updated case management system

Wed Jan 22    8:00 AM-12:00 PM  4.0 hrs   David Sweet     Expert Witness
              Description: On-site inspection of fire damage
              Notes: Weather conditions documented

Wed Jan 22    1:00 PM-6:00 PM   5.0 hrs   David Sweet     Expert Witness
              Description: Continued on-site analysis
              Notes: Photos taken, samples collected

Thu Jan 23    9:00 AM-11:30 AM  2.5 hrs   Sharon Kisner   Administrative
              Description: Processed inspection documentation
              Notes: Lab samples logged

                                ────────
TOTAL HOURS - ACME Corporation: 31.5 hrs
═══════════════════════════════════════════════════════════════

Note: This is a progress report only. Invoice will be generated
at month end. Please contact accounting@mitigationconsulting.com
with any questions.
```

**Format Details:**
- Clear "DO NOT PAY" header
- Customer/Job name prominent
- Grouped by employee under each customer
- Chronological within employee
- Shows clock times when available
- Includes description AND notes
- Subtotals per employee
- Grand total per customer
- Professional footer

---

### Option B: Enhanced HTML Email Version

Same data, formatted as HTML email with:
- Company logo/branding
- Color coding by service type
- Expandable/collapsible sections
- Mobile-responsive design
- "View in QuickBooks" link

---

## 💰 MONTHLY INVOICE INTERFACE

### Flow:
```
1. User selects "This Month" date range
2. Filters to specific customer
3. Reviews all billable time
4. Clicks "Create Monthly Invoice"
5. System:
   - Creates invoice in QuickBooks
   - Marks time as "HasBeenBilled"
   - Shows invoice number
   - Provides "View in QB" link
```

### Preview Screen Before Creating Invoice:

```
┌─────────────────────────────────────────────────────────────┐
│  Create Monthly Invoice - ACME Corporation                   │
│  Period: January 1-31, 2026                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Summary:                                                    │
│  • Total Hours: 156.5                                        │
│  • Total Entries: 47                                         │
│  • Billable Amount: $58,437.50                              │
│                                                              │
│  Line Items (grouped by service type):                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Expert Witness - Deposition        89.5 hrs @ $450   │   │
│  │                              $40,275.00               │   │
│  │                                                        │   │
│  │ Pre-Trial Preparation              42.0 hrs @ $375   │   │
│  │                              $15,750.00               │   │
│  │                                                        │   │
│  │ Administrative                     25.0 hrs @ $250   │   │
│  │                               $6,250.00               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Invoice Details:                                            │
│  Terms: Net 30                                               │
│  Due Date: March 1, 2026                                     │
│                                                              │
│  [⚠️ Warning: This will create an invoice in QuickBooks     │
│   and mark all time entries as "HasBeenBilled"]             │
│                                                              │
│  [Cancel]  [Create Invoice in QuickBooks]                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 COMPONENT SPECIFICATIONS

### 1. Date Range Picker
**Component:** ShadCN DateRangePicker + Custom Quick Filters
```typescript
<DateRangePicker
  defaultPreset="this_week"
  presets={[
    { label: "This Week", value: "this_week" },
    { label: "Last Week", value: "last_week" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
  ]}
  onChange={(range) => fetchTimeEntries(range)}
/>
```

### 2. Customer Filter
**Component:** Multi-select Dropdown (Combobox)
```typescript
<CustomerSelect
  customers={customersFromDB}
  placeholder="Select customer..."
  onChange={(customerId) => filterByCustomer(customerId)}
/>
```

### 3. Time Entry Card
**Component:** Custom Card with Expandable Details
```typescript
<TimeEntryCard
  employee="David Sweet"
  date="2026-01-27"
  startTime="9:00 AM"
  endTime="5:00 PM"
  duration="8.0"
  costCode="Expert Witness - Deposition"
  description="Reviewed fire scene photos..."
  notes="Client meeting scheduled..."
  rate={450}  // Optional - show/hide
/>
```

### 4. Grouped View
**Component:** TanStack Table with Grouping
```typescript
<DataTable
  data={timeEntries}
  groupBy="customer"
  subGroupBy="employee"
  columns={[
    { header: "Date", accessor: "txn_date" },
    { header: "Time", accessor: "time_range" },
    { header: "Duration", accessor: "duration" },
    { header: "Service", accessor: "service_item_name" },
    { header: "Description", accessor: "description" },
  ]}
  showSubtotals={true}
/>
```

---

## 📧 EMAIL REPORT GENERATION

### Weekly Report Email:

**Subject:** Weekly Progress Report - [Customer Name] - [Week of Jan 20]

**Body:**
```html
<div style="font-family: Arial, sans-serif;">
  <div style="background: #f44336; color: white; padding: 20px; text-align: center;">
    <h1>DO NOT PAY - WEEKLY PROGRESS REPORT</h1>
  </div>

  <div style="padding: 20px;">
    <h2>ACME Corporation - Fire Damage Project</h2>
    <p>Period: January 20-26, 2026</p>

    <!-- Time entries grouped by employee -->
    <table style="width: 100%; border-collapse: collapse;">
      <!-- Table content here -->
    </table>

    <div style="background: #fff3cd; padding: 15px; margin-top: 20px;">
      <strong>Note:</strong> This is a progress report only.
      Invoice will be generated at month end.
    </div>
  </div>
</div>
```

**Send Via:** Outlook/Microsoft Graph API (Azure function)

---

## 🔧 IMPLEMENTATION PRIORITY

### Phase 1: Core Interface (This Week)

1. ✅ **Date Range Picker**
   - Quick filters (This Week, This Month, Custom)
   - Default to "This Week"
   - Store last used range in localStorage

2. ✅ **Customer Filter Dropdown**
   - Fetch customers from database
   - Multi-select support
   - "All Customers" option

3. ✅ **Employee Filter Dropdown**
   - Fetch unique employees from time entries
   - Filter within selected customer

4. ✅ **Grouped Data Display**
   - Group by Customer:Job
   - Sub-group by Employee
   - Collapsible sections

5. ✅ **Time Entry Details**
   - Show all fields (date, time, duration, cost code, description, notes)
   - Clean, readable format

### Phase 2: Report Generation (Next Week)

6. ✅ **Weekly Report Generator**
   - Generate QB-style formatted report
   - HTML version for screen
   - PDF export option

7. ✅ **Email Integration**
   - Send via Outlook
   - Professional formatting
   - "DO NOT PAY" header

8. ✅ **Monthly Invoice Creator**
   - Preview before creating
   - Create in QuickBooks
   - Mark time as billed

### Phase 3: Polish (Following Week)

9. ✅ **Search & Advanced Filters**
   - Search descriptions/notes
   - Cost code filter
   - Billable status filter

10. ✅ **Export Options**
    - CSV export
    - Excel export
    - PDF download

11. ✅ **UI Polish**
    - Loading states
    - Error handling
    - Success messages

---

## 📐 TECHNICAL STACK

### Frontend:
- **Framework:** Next.js 14 (App Router)
- **UI Components:** ShadCN UI + Radix UI
- **Table:** TanStack Table (React Table v8)
- **Date Picker:** react-day-picker (via ShadCN)
- **Forms:** React Hook Form + Zod validation
- **State:** React Query (TanStack Query)
- **Styling:** Tailwind CSS

### Report Generation:
- **HTML:** React components → HTML string
- **PDF:** @react-pdf/renderer or Puppeteer
- **Email:** Microsoft Graph API (Outlook)

### Data Flow:
```
User selects date range
  ↓
Frontend → Supabase Edge Function → QuickBooks API
  ↓
QB Time Entries → Transform → Supabase DB
  ↓
Frontend fetches from Supabase → Display grouped
  ↓
User generates report → Format → Email/PDF
```

---

## ✅ ACCEPTANCE CRITERIA

### Weekly Report Feature:
- [ ] User can select "This Week" and see all time entries
- [ ] Entries grouped by Customer → Employee
- [ ] Shows: Date, Time, Duration, Cost Code, Description, Notes
- [ ] Can filter by specific customer
- [ ] Can filter by employee
- [ ] Subtotals per employee shown
- [ ] Grand total per customer shown
- [ ] "Generate Report" button creates formatted report
- [ ] Report has "DO NOT PAY" header
- [ ] Can email report to client
- [ ] Report format matches QuickBooks style

### Monthly Invoice Feature:
- [ ] User can select "This Month" date range
- [ ] Shows all billable time for customer
- [ ] Groups by service type
- [ ] Shows total hours and $ amount
- [ ] Preview before creating invoice
- [ ] Creates actual invoice in QuickBooks
- [ ] Marks time as "HasBeenBilled"
- [ ] Shows QB invoice number after creation
- [ ] Prevents duplicate invoices for same period

---

## 🎯 NEXT STEPS

1. ✅ Review this design with user
2. ✅ Get approval on report format
3. ✅ Start Phase 1 implementation
4. ✅ Build date picker + filters
5. ✅ Build grouped display
6. ✅ Test with real production data
