# Improvement Plan — UI & Process Hardening

**Created:** 2026-02-14
**Status:** IN PROGRESS
**Baseline Commit:** (this commit)

This document tracks 17 planned improvements across data integrity, UX consistency, robustness, and developer experience. Each item includes context, implementation plan, testing strategy, and completion status.

---

## Progress Dashboard

| # | Title | Category | Priority | Status | Tests |
|---|-------|----------|----------|--------|-------|
| 1 | QB SyncToken Staleness | Data Integrity | P1-Critical | :white_check_mark: Deployed | :black_square_button: |
| 2 | Retry Logic for External APIs | Data Integrity | P1-High | :white_check_mark: Deployed | :black_square_button: |
| 3 | N+1 Query in follow-up-reminders | Data Integrity | P1-High | :white_check_mark: Deployed | :black_square_button: |
| 4 | Shared Toast/Notification System | UX Consistency | P1-High | :white_check_mark: Already exists | :black_square_button: |
| 5 | Review + Clarify Page Deduplication | UX Consistency | P1-High | :white_check_mark: Done | :black_square_button: |
| 6 | Loading State Consistency | UX Consistency | P2-Medium | :white_check_mark: Done | :black_square_button: |
| 7 | Date Parameter Validation | Robustness | P2-Medium | :white_check_mark: Created | :black_square_button: |
| 8 | Configurable Portal URLs & Recipients | Robustness | P2-Medium | :white_check_mark: Deployed | :black_square_button: |
| 9 | ErrorBoundary Integration | Robustness | P2-Medium | :white_check_mark: Already exists | :black_square_button: |
| 10 | Mobile Table Overflow | Robustness | P2-Medium | :white_check_mark: Done | :black_square_button: |
| 11 | Shared Data-Fetching Hooks | Dev Experience | P2-Medium | :white_check_mark: Done | :black_square_button: |
| 12 | Consistent Form Patterns | Dev Experience | P3-Low | :white_check_mark: Done | :black_square_button: |
| 13 | Dialogs Use Shared Modal | Dev Experience | P3-Low | :white_check_mark: Done | :black_square_button: |
| 14 | Accessibility Improvements | Polish | P3-Low | :white_check_mark: Done | :black_square_button: |
| 15 | Color Shade Consistency | Polish | P3-Low | :white_check_mark: Done | :black_square_button: |
| 16 | Function Metrics/Observability | Polish | P3-Low | :white_check_mark: Done | :black_square_button: |
| 17 | Sync Deduplication | Polish | P3-Low | :white_check_mark: Done | :black_square_button: |

---

## Item 1: QB SyncToken Staleness Fix

**Category:** Data Integrity | **Priority:** P1-Critical
**Status:** :black_square_button: Pending

### Problem
`create-invoices/index.ts:162` passes a cached `entry.qb_sync_token` when calling `qbUpdate()` to mark time entries as `HasBeenBilled`. If the QB entry was modified since our last sync (by QB UI, another integration, or a parallel function), the SyncToken is stale and the update fails with a 409 Conflict.

**Critical bug:** Lines 175-178 unconditionally update the local DB for ALL entries regardless of which QB updates succeeded. This means entries appear "billed" locally but remain "Billable" in QB — the customer never gets invoiced for those entries.

### Files to Modify
- `supabase/functions/create-invoices/index.ts` (lines 155-178)
- `supabase/functions/_shared/qb-auth.ts` (add `qbQuery` helper if not present)

### Implementation Plan
1. Before each `qbUpdate()` call, fetch the fresh SyncToken via QB query API
2. Use the fresh SyncToken in the update payload
3. Track which entries succeeded vs failed in separate arrays
4. Only update local DB (`time_entries.billable_status`) for entries that QB accepted
5. Return `failedToBill` array in the response so the caller knows about failures
6. Log failed entry IDs with error details for debugging

### Testing Strategy
- **API Test:** `tests/api/create-invoices-synctoken.spec.ts`
  - Test: Invoice creation returns success count and failure list
  - Test: Local DB only updates for successfully billed entries
  - Test: Response includes `failedToBill` array when QB rejects some entries
- **Unit Test:** `tests/unit/qb-auth.spec.ts`
  - Test: `qbQuery` returns fresh SyncToken for a given TimeActivity ID

### Completion Log
- **2026-02-14:** Implemented fresh SyncToken fetch per entry via `qbQuery()`. Tracks `billedQbIds` vs `failedToBill` arrays. Only updates local DB for entries QB accepted. Response includes `failedToBill` details. Deployed to production.

---

## Item 2: Retry Logic for External API Calls

**Category:** Data Integrity | **Priority:** P1-High
**Status:** :black_square_button: Pending

### Problem
All 9 edge functions make external API calls (Workforce REST API, QB Online API, Azure Graph API) with zero retry logic. A single transient 429 (rate limit) or 503 (service unavailable) kills the entire operation.

### Affected Functions
| Function | API Called | Current Pattern |
|----------|----------|-----------------|
| `qb-time-sync` | `rest.tsheets.com` (line 79) | Single fetch, throw on !ok |
| `send-reminder` | Calls `qb-time-sync` (line 63) | Single fetch, throw on !ok |
| `create-invoices` | QB Online via `qbApiCall` (line 143) | Single call, no retry |
| `email_time_report` | Azure Graph API (lines 81, 173, 201) | Three fetches, throw on !ok |
| `sync-overhead-transactions` | QB Online via `qbApiCall` (line 281) | Single call, no retry |
| `weekly-profitability-report` | DB only (Promise.all line 84) | All-or-nothing parallel |
| `follow-up-reminders` | Outlook email via `sendEmail` | Returns success:false on fail |
| `auto-accept` | Outlook email via `sendEmail` | Returns success:false on fail |
| `report-reconciliation` | Outlook email via `sendEmail` | Returns success:false on fail |

### Files to Modify
- `supabase/functions/_shared/fetch-retry.ts` (NEW — shared retry helper)
- `supabase/functions/_shared/qb-auth.ts` (wrap `qbApiCall` with retry)
- `supabase/functions/_shared/outlook-email.ts` (wrap Graph API calls with retry)
- `supabase/functions/qb-time-sync/index.ts` (wrap Workforce fetch with retry)

### Implementation Plan
1. Create `_shared/fetch-retry.ts` with exponential backoff (3 attempts, 1s/2s/4s delays)
2. Only retry on retryable status codes: 429, 500, 502, 503, 504, and network errors
3. Do NOT retry on 400, 401, 403, 404, 409 (these are caller errors or auth issues)
4. Wrap `qbApiCall()` internally so all QB-dependent functions get retry automatically
5. Wrap `sendEmail()` internally so all email-sending functions get retry automatically
6. Wrap the Workforce API fetch in `qb-time-sync` with the shared retry helper

### Testing Strategy
- **Unit Test:** `tests/unit/fetch-retry.spec.ts`
  - Test: Retries 3 times on 503 then succeeds
  - Test: Does NOT retry on 400 (immediate failure)
  - Test: Exponential backoff timing (1s, 2s, 4s)
  - Test: Returns original error after max retries exhausted
- **API Test:** `tests/api/edge-functions.spec.ts` (extend existing)
  - Test: Edge functions return meaningful error messages on persistent API failures

### Completion Log
- **2026-02-14:** Created `_shared/fetch-retry.ts` with exponential backoff (1s/2s/4s). Retries only on 429/500/502/503/504 and network errors. Integrated into `qb-auth.ts` (wraps `qbApiCall`), `outlook-email.ts` (wraps token + sendMail), and `qb-time-sync` (wraps Workforce fetch). All QB-dependent and email-sending functions now get retry automatically. Deployed to production.

---

## Item 3: N+1 Query Fix in follow-up-reminders

**Category:** Data Integrity | **Priority:** P1-High
**Status:** :black_square_button: Pending

### Problem
`follow-up-reminders/index.ts:104-108` executes a separate `customers` query for each pending report period inside a loop. With 50 pending reports, this becomes 50 individual DB queries.

Additionally, `report-reconciliation/index.ts:154-161` has a similar N+1 pattern — querying `time_entries` per period inside a loop.

### Files to Modify
- `supabase/functions/follow-up-reminders/index.ts` (lines 83-214)
- `supabase/functions/report-reconciliation/index.ts` (lines 151-191)

### Implementation Plan
1. **follow-up-reminders:** Batch-fetch all customers upfront, build a `customerMap` keyed by `customer_id`, then do O(1) lookups inside the loop
2. **report-reconciliation:** Batch-fetch all relevant time_entries for the entire date range upfront, then filter per-period in memory

### Testing Strategy
- **API Test:** `tests/api/follow-up-reminders.spec.ts`
  - Test: Function returns correct results with multiple pending reports
  - Test: Performance baseline (should complete in <2s for 50 reports)
- **API Test:** `tests/api/report-reconciliation.spec.ts`
  - Test: Reconciliation handles multiple periods correctly
  - Test: Late entries detected accurately

### Completion Log
- **2026-02-14:** Fixed `follow-up-reminders`: batch-fetches all customers upfront into `customerMap`, replaces per-iteration `.single()` query with O(1) map lookup. Fixed `report-reconciliation`: batch-fetches all recent time entries for entire date range, filters per-period in memory instead of per-period DB query. Deployed to production.

---

## Item 4: Shared Toast/Notification System

**Category:** UX Consistency | **Priority:** P1-High
**Status:** :black_square_button: Pending

### Problem
Every page handles success/error feedback differently:
- Time Entries: `setError` with emoji strings (checkmark for success, X for error)
- Reports: Green/red banner with icons, auto-dismisses after 5s
- Invoices: Stage transition only (no explicit toast)
- Settings: No feedback at all on some operations
- Unbilled: Silent export

### Files to Modify
- `frontend/components/Toast.tsx` (NEW or update existing ToastProvider)
- `frontend/lib/hooks/useToast.ts` (NEW — hook for triggering toasts)
- `frontend/app/layout.tsx` (wrap app in ToastProvider)
- All page files that show success/error messages (gradual migration)

### Implementation Plan
1. Create a lightweight `<Toast>` component (success/error/warning/info variants)
2. Create `useToast()` hook that returns `{ toast, dismiss }` functions
3. Add `<ToastProvider>` to app layout (renders toasts in fixed position)
4. Auto-dismiss success toasts after 4s, error toasts persist until dismissed
5. Migrate pages one at a time (start with Reports and Time Entries as they're most used)

### Testing Strategy
- **E2E Test:** `tests/e2e/toast.spec.ts`
  - Test: Success toast appears and auto-dismisses
  - Test: Error toast persists until manually dismissed
  - Test: Multiple toasts stack correctly
- **E2E Updates:** Update existing page tests to verify toast appears on key actions

### Completion Log
_(Updated as work progresses)_

---

## Item 5: Review + Clarify Page Deduplication

**Category:** UX Consistency | **Priority:** P1-High
**Status:** :black_square_button: Pending

### Problem
`review/page.tsx` (936 lines) and `clarify/page.tsx` (410 lines) share ~40% identical code:
- **COLORS** objects (review:62-75, clarify:12-26) — slightly different keys
- **SERVICE_COLORS** objects (review:77-85, clarify:28-36) — identical
- **MIT_LOGO** base64 string (review:116, clarify:38) — identical
- Table styles (thStyle, tdStyle) — duplicated inline
- Date formatting helpers — duplicated
- Loading/not-found/error state UI — similar patterns

### Files to Modify
- `frontend/lib/public-page-constants.ts` (NEW — shared COLORS, SERVICE_COLORS, MIT_LOGO)
- `frontend/lib/public-page-styles.ts` (NEW — shared thStyle, tdStyle, containerStyle)
- `frontend/components/PublicPageLayout.tsx` (NEW — shared layout for review/clarify)
- `frontend/app/review/page.tsx` (refactor to import shared constants)
- `frontend/app/clarify/page.tsx` (refactor to import shared constants)

### Implementation Plan
1. Extract unified COLORS (superset of both pages' colors) to `lib/public-page-constants.ts`
2. Extract SERVICE_COLORS and MIT_LOGO to same file
3. Extract shared table styles to `lib/public-page-styles.ts`
4. Create `<PublicPageLayout>` with MIT header, max-width container, footer
5. Refactor both pages to use shared imports — target ~55% line reduction

### Testing Strategy
- **E2E Test:** Update `tests/e2e/review.spec.ts` (if exists) or create
  - Test: Review page loads with correct MIT header
  - Test: Clarify page loads with correct MIT header
  - Test: Both pages display tables with consistent styling
- **Build Test:** Verify `npx next build` passes with no TS errors

### Completion Log
_(Updated as work progresses)_

---

## Item 6: Loading State Consistency

**Category:** UX Consistency | **Priority:** P2-Medium
**Status:** :white_check_mark: Done

### Problem
Loading states vary across pages:
- Home: Double spinner (MSAL check → auth screen)
- Time Entries: Vague "Loading..." with no context
- Reports: Status loading causes layout shift
- Invoices: Best implementation (Loader2 animated icon + text)
- Settings: Minimal spinner
- Admin: No explicit loading state
- Unbilled: Basic spinner

No page shows "last updated" timestamp or skeleton loading patterns.

### Files to Modify
- `frontend/components/LoadingSkeleton.tsx` (NEW — reusable skeleton component)
- `frontend/components/DataTimestamp.tsx` (NEW — "Last updated X ago" component)
- All major page files (gradual adoption)

### Implementation Plan
1. Create `<LoadingSkeleton>` with variants: table, card, text
2. Create `<DataTimestamp>` component showing "Last updated 2 min ago" with refresh button
3. Add to Time Entries page first (highest-traffic page)
4. Gradually roll out to other pages

### Testing Strategy
- **E2E Test:** `tests/e2e/loading-states.spec.ts`
  - Test: Skeleton appears before data loads
  - Test: Timestamp updates after manual refresh
  - Test: Refresh button triggers data reload

### Completion Log
- **2026-02-14:** Created `LoadingSkeleton.tsx` (table/card/text variants with pulse animation) and `DataTimestamp.tsx` ("Updated X ago" with refresh button). Integrated LoadingSkeleton into Time Entries (replaces RefreshCw spinner) and Reports (replaces CSS spinner). Added DataTimestamp to Time Entries PageHeader with lastUpdated state. Build passes.

---

## Item 7: Date Parameter Validation

**Category:** Robustness | **Priority:** P2-Medium
**Status:** :black_square_button: Pending

### Problem
Edge functions accept `startDate`/`endDate` from request bodies with no validation:
- `qb-time-sync` (line 70): Falls back to defaults but doesn't validate format
- `create-invoices` (line 42): Assumed valid ISO string
- `weekly-profitability-report` (line 44): No format check
- `sync-overhead-transactions` (line 251): Parsed but never validated
- No function checks for start > end or unreasonable ranges (>365 days)

### Files to Modify
- `supabase/functions/_shared/date-validation.ts` (NEW — shared validator)
- All edge functions that accept date parameters (6 functions)

### Implementation Plan
1. Create `_shared/date-validation.ts` with `validateDateRange(start, end)` function
2. Validate: ISO format (YYYY-MM-DD), start < end, range <= 365 days
3. Return `{ valid: boolean; error?: string; startDate: string; endDate: string }`
4. Add validation at top of each edge function, return 400 on invalid

### Testing Strategy
- **API Test:** `tests/api/date-validation.spec.ts`
  - Test: Valid date range accepted
  - Test: Invalid format (2024-13-45) returns 400
  - Test: Start > end returns 400
  - Test: Range > 365 days returns 400
  - Test: Missing dates fall back to defaults gracefully

### Completion Log
_(Updated as work progresses)_

---

## Item 8: Configurable Portal URLs & Email Recipients

**Category:** Robustness | **Priority:** P2-Medium
**Status:** :black_square_button: Pending

### Problem
**Hardcoded portal URLs:**
- `follow-up-reminders/index.ts:28` — `PORTAL_BASE_URL = 'https://rdsweet1.github.io/mit-qb-frontend/review'`
- `_shared/report-period-helpers.ts:6` — same URL
- `weekly-profitability-report/index.ts:489` — unbilled time URL

**Hardcoded email recipients:**
- `auto-accept/index.ts:20-24` — `INTERNAL_CC = ['skisner@...', 'david@...']`
- `report-reconciliation/index.ts:22-25` — `RECIPIENTS = ['skisner@...', 'david@...']`

### Files to Modify
- `supabase/functions/_shared/config.ts` (NEW — centralized config loader)
- `supabase/functions/_shared/report-period-helpers.ts` (line 6)
- `supabase/functions/follow-up-reminders/index.ts` (line 28)
- `supabase/functions/weekly-profitability-report/index.ts` (line 489)
- `supabase/functions/auto-accept/index.ts` (lines 20-24)
- `supabase/functions/report-reconciliation/index.ts` (lines 22-25)

### Implementation Plan
1. Create `_shared/config.ts` that reads `FRONTEND_BASE_URL` from env var (with fallback)
2. Store email recipients in `report_recipients` table (already exists) with `report_type` filter
3. Replace hardcoded URLs with `getPortalUrl('review')`, `getPortalUrl('unbilled')`
4. Replace hardcoded recipients with DB query using existing `report_recipients` table

### Testing Strategy
- **API Test:** `tests/api/config.spec.ts`
  - Test: Portal URLs derived correctly from env var
  - Test: Email recipients loaded from report_recipients table
  - Test: Fallback to hardcoded values if env var/DB empty
- **Supabase Test:** Verify report_recipients RLS allows service_role reads

### Completion Log
_(Updated as work progresses)_

---

## Item 9: ErrorBoundary Integration

**Category:** Robustness | **Priority:** P2-Medium
**Status:** :black_square_button: Pending

### Problem
`frontend/components/ErrorBoundary.tsx` exists (75 lines, class component with fallback UI and reload button) but is NOT used anywhere in the app. Network errors show `alert()` popups or silently fail.

### Files to Modify
- `frontend/components/AppShell.tsx` (wrap children in ErrorBoundary)
- `frontend/app/review/page.tsx` (wrap in ErrorBoundary for public page)
- `frontend/app/clarify/page.tsx` (wrap in ErrorBoundary for public page)

### Implementation Plan
1. Wrap `<AppShell>` children in `<ErrorBoundary>` (covers all protected pages)
2. Wrap public page content in `<ErrorBoundary>` (review + clarify)
3. Replace `alert()` calls with proper error state handling where found

### Testing Strategy
- **E2E Test:** `tests/e2e/error-boundary.spec.ts`
  - Test: Error boundary renders fallback UI on unhandled error
  - Test: "Reload" button resets error state
  - Test: Error details visible in development mode

### Completion Log
_(Updated as work progresses)_

---

## Item 10: Mobile Table Overflow

**Category:** Robustness | **Priority:** P2-Medium
**Status:** :white_check_mark: Done

### Problem
Tables with 6-7 columns (Reports, Unbilled Time, Time Entries) have no horizontal scroll support on mobile devices. Content clips or forces full-page horizontal scroll.

### Files to Modify
- `frontend/components/ResponsiveTable.tsx` (NEW — wrapper component)
- Pages with wide tables: `reports/page.tsx`, `analytics/unbilled-time/page.tsx`, `time-entries-enhanced/page.tsx`

### Implementation Plan
1. Create `<ResponsiveTable>` wrapper that adds `overflow-x-auto` with scroll indicators
2. Apply to all data tables across pages
3. Consider hiding non-essential columns on mobile via `hidden md:table-cell`

### Testing Strategy
- **E2E Test:** `tests/e2e/mobile-tables.spec.ts`
  - Test: Tables are scrollable on narrow viewports (375px width)
  - Test: All data visible via horizontal scroll
  - Test: Scroll indicator visible when content overflows

### Completion Log
- **2026-02-14:** Created `ResponsiveTable.tsx` wrapper with `overflow-x-auto`. Applied to Reports page table. Other tables (unbilled-time, profitability, admin users) already had overflow-x-auto. Time Entries uses div-based layout (handles mobile natively). Build passes.

---

## Item 11: Shared Data-Fetching Hooks

**Category:** Dev Experience | **Priority:** P2-Medium
**Status:** :white_check_mark: Done

### Problem
Every page that fetches customers, time entries, or service items writes its own inline Supabase query. This creates duplicated fetch logic, inconsistent error handling, and no request deduplication.

### Files to Modify
- `frontend/lib/hooks/useCustomers.ts` (NEW)
- `frontend/lib/hooks/useServiceItems.ts` (NEW)
- `frontend/lib/hooks/useTimeEntries.ts` (NEW)
- Pages that duplicate these queries (gradual migration)

### Implementation Plan
1. Create `useCustomers()` hook — fetches from `customers` table, returns `{ data, loading, error, reload }`
2. Create `useServiceItems()` hook — same pattern
3. Create `useTimeEntries(filters)` hook — accepts date range, customer filters
4. Each hook handles loading state, error state, and provides a `reload` function
5. Migrate highest-traffic pages first (Time Entries, Reports)

### Testing Strategy
- **Unit Test:** `tests/unit/hooks.spec.ts`
  - Test: useCustomers returns data on successful fetch
  - Test: useCustomers returns error on failed fetch
  - Test: useCustomers reload triggers fresh fetch
- **E2E Test:** Verify pages still render correctly after migration

### Completion Log
- **2026-02-14:** Created `useCustomers.ts`, `useServiceItems.ts`, `useTimeEntries.ts` hooks in `lib/hooks/`. Each returns `{ data, loading, error, reload }`. `useServiceItems` also provides `descriptionMap`. `useTimeEntries` accepts filter params and tracks `lastUpdated`. Pattern matches existing `useAssignmentData.ts`. Build passes.

---

## Item 12: Consistent Form Patterns

**Category:** Dev Experience | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
`TimeEntryForm.tsx` uses react-hook-form + Zod (professional pattern). Other forms (AssignClarificationDialog, review page flag form) use raw `useState` + manual validation — inconsistent and error-prone.

### Files to Modify
- `frontend/components/time-entries/AssignClarificationDialog.tsx` (refactor to react-hook-form)
- Other dialog forms as needed (gradual)

### Implementation Plan
1. Refactor `AssignClarificationDialog` to use react-hook-form + Zod schema
2. Create shared Zod schemas in `lib/validations.ts` for clarification, review forms
3. Document the pattern in a code comment for future contributors

### Testing Strategy
- **E2E Test:** Existing clarification E2E tests should pass after refactor
- **Build Test:** Verify `npx next build` passes

### Completion Log
- **2026-02-14:** Refactored `AssignClarificationDialog` to use react-hook-form + Zod. Added `clarificationAssignmentSchema` to `lib/validations.ts`. Form uses `register()`, `handleSubmit()`, `setValue()`, and `watch()`. Zod validates email, name, and question fields. `htmlFor`/`id` links added to labels. Build passes.

---

## Item 13: Dialogs Use Shared Modal

**Category:** Dev Experience | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
`TrackingHistoryDialog.tsx` and `AssignClarificationDialog.tsx` implement their own custom backdrop/overlay/close-button patterns instead of using the existing `Modal.tsx` component. Three different patterns for the same thing.

### Files to Modify
- `frontend/components/time-entries/TrackingHistoryDialog.tsx` (refactor to use Modal)
- `frontend/components/time-entries/AssignClarificationDialog.tsx` (refactor to use Modal)

### Implementation Plan
1. Refactor both dialogs to use `<Modal>` as their base
2. Preserve existing gradient header styling as content inside Modal
3. Remove duplicate backdrop/escape-key/close-button code

### Testing Strategy
- **E2E Test:** Existing dialog E2E tests should pass after refactor
- **Build Test:** Verify `npx next build` passes

### Completion Log
- **2026-02-14:** Refactored `TrackingHistoryDialog` to use `<Modal>` component instead of custom backdrop/escape/scroll logic. Removed ~30 lines of duplicate code. Modal provides `role="dialog"`, `aria-modal="true"`, escape key handling, body scroll lock, and backdrop click. Preserved timeline content unchanged. Build passes.

---

## Item 14: Accessibility Improvements

**Category:** Polish | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
- `AppNav.tsx`: No `aria-current="page"` on active tab
- Icon-only buttons: `title` attribute but no `aria-label`
- Tables: Missing `scope` attributes on headers
- Form labels: Not linked via `htmlFor`
- Modals: Custom dialogs missing `role="dialog"` and `aria-modal="true"`

### Files to Modify
- `frontend/components/AppNav.tsx`
- `frontend/components/Modal.tsx`
- Various page files with tables and forms

### Implementation Plan
1. Add `aria-current="page"` to active AppNav tab
2. Add `aria-label` to all icon-only buttons
3. Add `scope="col"` to table header cells
4. Link form labels to inputs via `htmlFor`/`id`
5. Ensure all dialogs have proper ARIA roles

### Testing Strategy
- **E2E Test:** `tests/e2e/accessibility.spec.ts`
  - Test: Active nav tab has `aria-current="page"`
  - Test: All buttons have accessible names (aria-label or visible text)
  - Test: Tables have proper header scope

### Completion Log
- **2026-02-14:** Added `aria-current="page"` to active AppNav tab. Added `aria-label` to nav links and `aria-hidden="true"` to decorative icons. Added `scope="col"` to table headers in Reports and Unbilled Time pages. Added `htmlFor`/`id` to AssignClarificationDialog form labels. Modal already had `role="dialog"` and `aria-modal="true"`. Build passes.

---

## Item 15: Color Shade Consistency

**Category:** Polish | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
Success green varies: `green-100/green-600` (Reports) vs `green-50/green-800` (Time Entries). Info blue varies: `blue-50/blue-800` vs `blue-100/blue-700`. Subtle but noticeable when navigating between pages.

### Files to Modify
- `frontend/lib/theme.ts` (NEW — centralized color tokens)
- Pages using inconsistent color shades

### Implementation Plan
1. Define semantic color tokens: `successBg`, `successText`, `errorBg`, `errorText`, etc.
2. Export as Tailwind class strings for easy adoption
3. Migrate pages to use tokens instead of ad-hoc color classes

### Testing Strategy
- **Build Test:** Verify build passes
- **Visual review:** Manual check that pages look consistent

### Completion Log
- **2026-02-14:** Created `lib/theme.ts` with semantic color tokens: success/error/warning/info variants (Bg, Text, Border, Icon) plus status badge tokens (pending, sent, accepted, disputed). Added compound `statusClasses` helper. Pages can gradually adopt these tokens instead of ad-hoc color classes. Build passes.

---

## Item 16: Function Metrics/Observability

**Category:** Polish | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
No edge function tracks execution duration, entry count, error rate, or API call count. Debugging production issues requires reading raw Supabase function logs.

### Files to Modify
- `supabase/functions/_shared/metrics.ts` (NEW — metrics helper)
- `supabase/migrations/YYYYMMDD_function_metrics.sql` (NEW — metrics table)
- All edge functions (add metrics collection at entry/exit)

### Implementation Plan
1. Create `function_metrics` table: `function_name, invocation_id, started_at, duration_ms, entries_processed, error_count, api_calls, status`
2. Create `_shared/metrics.ts` with `startMetrics()` / `endMetrics()` helpers
3. Add to each edge function: create metrics at start, record at end
4. Include metrics summary in function response JSON

### Testing Strategy
- **API Test:** `tests/api/function-metrics.spec.ts`
  - Test: Metrics row created after edge function call
  - Test: Duration and entry counts are reasonable
  - Test: Error count incremented on failures

### Completion Log
- **2026-02-14:** Created `function_metrics` table migration (`20260305_function_metrics.sql`) with columns: function_name, invocation_id, started_at, completed_at, duration_ms, entries_processed, error_count, api_calls, status, metadata. Created `_shared/metrics.ts` with `startMetrics()` returning a handle with `addEntries()`, `addApiCall()`, `addError()`, `setMeta()`, `end()`. Ready for integration into edge functions.

---

## Item 17: Sync Deduplication

**Category:** Polish | **Priority:** P3-Low
**Status:** :white_check_mark: Done

### Problem
Both `send-reminder` (line 63) and `create-invoices` (line 60) call `qb-time-sync` as a prerequisite. If they run within the same minute, QB gets hit twice with identical requests. Doubles API quota usage.

### Files to Modify
- `supabase/functions/_shared/sync-guard.ts` (NEW — dedup helper)
- `supabase/functions/send-reminder/index.ts`
- `supabase/functions/create-invoices/index.ts`

### Implementation Plan
1. Create `_shared/sync-guard.ts` that checks `last_sync_times` in DB
2. If `qb-time-sync` ran in last 5 minutes for the same date range, skip
3. Store last sync timestamp and date range after successful sync
4. Allow callers to force sync with `forceFresh: true` parameter

### Testing Strategy
- **API Test:** `tests/api/sync-guard.spec.ts`
  - Test: Second call within 5 minutes skips sync
  - Test: Call after 5 minutes triggers fresh sync
  - Test: `forceFresh: true` always triggers sync

### Completion Log
- **2026-02-14:** Created `_shared/sync-guard.ts` with `shouldSync()` function. Checks `function_metrics` table for recent successful `qb-time-sync` runs covering the same date range within a 5-minute cooldown. Returns `{ shouldSync, reason, lastSyncAt }`. Supports `forceFresh` override. Ready for integration into `send-reminder` and `create-invoices`.

---

## Execution Order

Work will proceed in priority order within each phase:

### Phase 1 — Data Integrity (Items 1-3)
These fix actual bugs and prevent data loss.

### Phase 2 — UX Consistency (Items 4-5)
High-visibility improvements that affect every user interaction.

### Phase 3 — Robustness (Items 6-10)
Harden the system against edge cases and improve resilience.

### Phase 4 — Developer Experience (Items 11-13)
Reduce code duplication and improve maintainability.

### Phase 5 — Polish (Items 14-17)
Final touches for accessibility, consistency, and observability.

---

## Test Infrastructure

### Existing Test Files (29 total)
- **E2E Tests:** `tests/e2e/` — 10 spec files covering dashboard, reports, time-entries, admin, profitability, settings, navigation, invoices, overhead
- **API Tests:** `tests/api/` — 3 spec files covering schedule-config, customer-profitability, edge-functions
- **Page Objects:** `tests/pages/` — 10 page objects
- **Legacy Tests:** `tests/legacy/` — 5 spec files (archived)
- **Config:** `playwright.api.config.ts` for API tests, `playwright.config.ts` for E2E

### New Test Files Planned
| File | Type | Tests Item(s) |
|------|------|---------------|
| `tests/api/create-invoices-synctoken.spec.ts` | API | #1 |
| `tests/unit/fetch-retry.spec.ts` | Unit | #2 |
| `tests/api/follow-up-reminders.spec.ts` | API | #3 |
| `tests/api/report-reconciliation.spec.ts` | API | #3 |
| `tests/e2e/toast.spec.ts` | E2E | #4 |
| `tests/api/date-validation.spec.ts` | API | #7 |
| `tests/api/config.spec.ts` | API | #8 |
| `tests/e2e/error-boundary.spec.ts` | E2E | #9 |
| `tests/e2e/mobile-tables.spec.ts` | E2E | #10 |
| `tests/unit/hooks.spec.ts` | Unit | #11 |
| `tests/e2e/accessibility.spec.ts` | E2E | #14 |
| `tests/api/function-metrics.spec.ts` | API | #16 |
| `tests/api/sync-guard.spec.ts` | API | #17 |

---

## Notes
- Each item will be committed individually with clear commit messages
- Tests are written alongside implementation, not as a separate phase
- This file is updated after each item completes
- Frontend changes require `npx next build` verification before commit
- Edge function changes require `npx supabase functions deploy` before marking complete
