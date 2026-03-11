# CLAUDE.md — Project Instructions for AI Assistants

## Project Overview

WeeklyTimeBillingQB is a static Next.js app (GitHub Pages) + Supabase backend + Azure AD (MSAL) auth for MIT Consulting's timesheet and billing system.

## Repository Structure

There are **two separate git repos** in this project:

| Directory | Git Remote | Purpose |
|-----------|-----------|---------|
| `/` (root) | `RDSweet1/mit-qb-timesheet-system` | Supabase functions, migrations, docs |
| `frontend/` | `RDSweet1/mit-qb-frontend` | Next.js frontend (separate repo!) |

The `frontend/` directory is its own git repository with its own `origin` remote. Always `cd frontend` before running git commands for frontend changes.

## Frontend Deployment — CRITICAL

### How deployment works

The frontend deploys via **GitHub Actions** (not `gh-pages` npm package). The workflow is at `.github/workflows/deploy.yml` in the `mit-qb-frontend` repo.

**To deploy frontend changes:**
```bash
cd frontend
git add <files>
git commit -m "message"
git push origin main
```

Pushing to `main` triggers the GitHub Actions workflow which:
1. Checks out the code
2. Runs `npm install && npm run build`
3. Uploads `out/` as a GitHub Pages artifact
4. Deploys to `https://rdsweet1.github.io/mit-qb-frontend/`

**DO NOT use `npx gh-pages -d out`** — it pushes to a `gh-pages` branch that is NOT used. The Pages source is `main` branch via Actions workflow.

### basePath is required

Because the site is hosted at `/mit-qb-frontend/` (not root), `next.config.js` must have:
```js
basePath: '/mit-qb-frontend',
assetPrefix: '/mit-qb-frontend/',
```

Without these, all `_next/` asset URLs resolve to `https://rdsweet1.github.io/_next/...` (404) instead of `https://rdsweet1.github.io/mit-qb-frontend/_next/...`.

### MSAL redirect URI — runtime override

The `.env.local` file has `NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000` for local dev. Since `.env.local` takes priority over `.env.production` during `next build`, the wrong redirect URI gets baked into the static output.

The fix is in `components/AuthProvider.tsx` which overrides the redirect URI at runtime:
```js
const redirectUri = window.location.origin +
  (window.location.pathname.includes('/mit-qb-frontend') ? '/mit-qb-frontend/' : '/');
```

This means the baked-in value doesn't matter — the browser always uses the correct origin.

### Azure AD App Registration

- **App ID:** `973b689d-d96c-4445-883b-739fff12330b`
- **Tenant ID:** `aee0257d-3be3-45ae-806b-65c972c98dfb`
- **Platform:** Single-page application (SPA)
- **Redirect URIs configured in Azure Portal:**
  - `https://rdsweet1.github.io/mit-qb-frontend/`
  - `https://rdsweet1.github.io/mit-qb-frontend`
  - `https://rdsweet1.github.io/mit-qb-frontend/index-simple.html`
- **Implicit grant:** Access tokens + ID tokens enabled
- **Account type:** Single tenant (Mitigation Consulting only)

If you change the hosting URL, you MUST update the redirect URIs in Azure Portal > App registrations > Authentication.

## Data Flow — CRITICAL: Understand Before Changing Anything

### How data moves through the system

```
Technicians → QuickBooks Workforce (mobile app, clock in/out)
                      ↓
              QB Online (accounting, billing, TimeActivity records)
                      ↓
              Our App (syncs FROM QB, displays, allows note editing)
                      ↓
              QB Online (edited notes write BACK to QB Online TimeActivity.Description)
```

**Employees use QuickBooks Workforce** to enter time. They do NOT use TSheets directly. Workforce data syncs into QB Online automatically. Our app reads from BOTH APIs to get complete data:

| Data Source | What It Provides | API Endpoint | Token |
|-------------|-----------------|--------------|-------|
| **Workforce API** (rest.tsheets.com) | Clock in/out times, technician notes | `rest.tsheets.com/api/v1/` | `S.27__` token |
| **QB Online API** | Billing status, customer refs, SyncToken, Description | `quickbooks.api.intuit.com` | JWT via OAuth2 |

**Write-back goes to QB Online** — when notes are edited in our app, they update the `TimeActivity.Description` field in QB Online (the billing system). They do NOT write back to Workforce/TSheets.

### Two separate auth systems — DO NOT MIX

| System | Token Format | Auth Method | Credentials |
|--------|-------------|-------------|-------------|
| **Workforce API** (rest.tsheets.com) | `S.xx__...` | API Add-on token | `QB_TIME_CLIENT_ID`, `QB_TIME_CLIENT_SECRET` |
| **QB Online API** | JWT (`eyJ...`) | Intuit OAuth2 with auto-refresh | `QB_CLIENT_ID`, `QB_CLIENT_SECRET` |

### Workforce API token details

- **Token:** `S.27__0ca7c9d63ab6ca234b95869d4bf0c9322f8d4c0f`
- **Format:** API Add-on token (NOT an Intuit OAuth token)
- **Account URL:** `mitigationinform287059.tsheets.com`
- **Admin user:** `accounting@mitigationconsulting.com`
- **Company:** MITIGATION INFORMATION TECHNOLOGIES
- **Used by:** `qb-time-sync` edge function (reads clock times and technician notes)
- **API endpoint:** `https://rest.tsheets.com/api/v1/`

### QB Online token details

- **Format:** JWT (Intuit OAuth2), auto-refreshes via `_shared/qb-auth.ts`
- **Credentials:** `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_ACCESS_TOKEN`, `QB_REFRESH_TOKEN`, `QB_REALM_ID`
- **Used by:** `qb-online-sync`, `create-invoices`, `sync-service-items`, `update_qb_time_entry`
- **Write-back:** `update_qb_time_entry` writes edited notes to QB Online `TimeActivity.Description`

### How to refresh QB Online tokens (when refresh token expires)

QB Online refresh tokens expire after ~101 days. When you get `invalid_grant` errors:

**USE THE INTUIT OAUTH PLAYGROUND — do NOT construct manual URLs or use localhost scripts.**

**Step 1:** Go to https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0-playground
(NOTE: https://developer.intuit.com/app/developer/playground is WRONG — it redirects to workspaces)

**Step 2:** In Step 1 on the playground page:
- **Select app:** "Weekly Activity Report (Production)"
- It will auto-fill Client ID (`ABnNKfjx...`) and Client Secret
- **Check scopes:** `com.intuit.quickbooks.accounting`, `openid`, `profile`, `email`
- Click **"Get authorization code"**

**Step 3:** Log in with QuickBooks credentials, select the MIT company, and authorize.

**Step 4:** You'll land back on the playground with the auth code pre-filled in Step 2. Click **"Get tokens"**.

**Step 5:** Copy the **Access Token** and **Refresh Token** from the response. Update `.env` and Supabase:
```bash
npx supabase secrets set QB_CLIENT_ID="ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO" QB_CLIENT_SECRET="NEsyhDb1g5nficOBremLWghqSyfwvOLIhkrSBLye" QB_ACCESS_TOKEN="new_access_token" QB_REFRESH_TOKEN="new_refresh_token" QB_REALM_ID="9341455753458595"
```

**IMPORTANT NOTES:**
- **Production** credentials: Client ID `ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO` — this is the ONLY key that connects to the real MIT company
- **Development/Sandbox** credentials: Client ID `ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a` — connects to sandbox only, do NOT use
- **Realm ID:** `9341455753458595` (production MIT company)
- DO NOT construct manual OAuth URLs — always use the playground directly
- DO NOT use `node get-qb-token-localhost.js` or any localhost scripts

### DO NOT run `refresh-qb-time-token.js`

That script uses the **wrong credentials** (QB Online's `QB_CLIENT_ID` instead of the Workforce `QB_TIME_CLIENT_ID`). It will overwrite the working `S.27__` token in `.env` with a broken JWT token.

### How to verify the Workforce token works

```bash
curl -s -H "Authorization: Bearer S.27__0ca7c9d63ab6ca234b95869d4bf0c9322f8d4c0f" "https://rest.tsheets.com/api/v1/current_user"
```

If it returns user JSON -> token is valid. If 401 -> token expired, regenerate in Workforce admin (Feature Add-ons > API).

## Supabase Deployment

### Edge Functions
```bash
# From project root (NOT frontend/)
cd /c/SourceCode/WeeklyTimeBillingQB
npx supabase functions deploy <function_name> --no-verify-jwt
```

### Database Migrations
```bash
npx supabase db push
```

Migration files go in `supabase/migrations/` with format `YYYYMMDD_description.sql`. Each filename timestamp must be unique.

### Secrets
```bash
npx supabase secrets set KEY=value
```

Current secrets include: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QB_TIME_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, and others.

### RLS Policies

The frontend uses the **anon key** (not authenticated sessions). RLS policies must include the `anon` role for any operations the frontend performs:
- SELECT: anon can read time_entries, customers, service_items, app_users, audit logs
- UPDATE: anon can update unlocked time_entries (notes editing) and approval status
- Edge functions use service_role key and bypass RLS entirely

If a frontend write operation silently fails (data reverts on refresh), check that an RLS policy exists for the `anon` role on that table/operation.

### Project Reference
- **Supabase project:** `migcpasmtbdojqphqyzc` ("Weekly Time Report")
- **Region:** East US (North Virginia)

## Monitoring & Self-Heal

### Edge Functions for Monitoring

| Function | Schedule | Purpose |
|----------|----------|---------|
| `automation-health-digest` | Daily 7 AM EST | Checks all functions in `schedule_config` for staleness/errors, triggers self-heal if issues found, sends status email |
| `self-heal` | Every 15 min (pg_cron) | Two-source detection: reads ALERT emails from inbox + scans `schedule_config` for error/stale. Retries failed functions up to 2x, sends HEALED/ESCALATION email |
| `midweek-oversight` | Wednesday 10 AM EST | Mid-week check on reporting pipeline status |
| `sync-customer-emails` | Sunday 8 PM EST | Syncs customer email addresses from QB Online |

### Closed-Loop Self-Heal Flow

```
schedule_config shows stale/error
        ↓
health digest detects → invokes self-heal directly
        ↓
self-heal scans: inbox ALERT emails + schedule_config DB
        ↓
retries failed functions (POST with { manual: true })
        ↓
sends HEALED or ESCALATION email
        ↓
if health digest itself fails → watchdog (schedule-gate) sends ALERT email
        ↓
self-heal picks up ALERT email next 15-min cycle
```

### Key Details
- Self-heal skips itself (`SKIP_FUNCTIONS` set) to avoid infinite loops
- Self-heal updates its own `schedule_config.last_run_at` since it bypasses schedule-gate
- Health digest treats self-managed functions (self-heal) specially — checks `function_metrics` instead of `schedule_config` timestamps
- `schedule_config.last_run_status` values: `success`, `error`, `skipped_paused`, `never`
- Schedule gate (`_shared/schedule-gate.ts`) provides watchdog alerts via `outlookConfig` parameter — sends ALERT email if a function fails repeatedly
- `function_metrics` table tracks every invocation with duration, error count, metadata

### Email Layout (Customer-Facing Reports)

The `activityTable()` function in `_shared/email-templates.ts` renders a **3-column compact layout**:
- **Column 1** (130px): Date + NEW/UPDATED badge, employee name, clock in/out times (if available)
- **Column 2** (flex): Service code badge + description text (~65% of table width)
- **Column 3** (60px): Hours (right-aligned, bold)

Clock in/out times are formatted in Eastern time ("8:00 AM") via `fmtTime()` helpers in each report function. The `EntryRow` interface carries `startTime`/`endTime` optional fields.

Three functions produce customer-facing email tables — all use `activityTable()`:
- `send-reminder` — weekly reports (Monday 9 AM)
- `send-supplemental-report` — supplemental reports after edits
- `email_time_report` — manual sends from the UI (receives `startTime`/`endTime` from frontend)

Internal clarification emails (`clarificationRequestEmail()`) use a separate 6-column layout — NOT part of the compact layout.

## Key Patterns

- Edge functions follow the Deno `serve()` pattern with `corsHeaders` and service role client
- **Protected pages wrap content in `<AppShell>`** (`components/AppShell.tsx`), which provides:
  - `<ProtectedPage>` auth gate (login screen for unauthenticated users)
  - Persistent MIT-branded header (logo, company name, user info, sign out)
  - `<AppNav>` horizontal tab bar (9 tabs: Time Entries, Reports, Invoices, Profitability, Overhead, Unbilled, Clarifications, Settings, Admin)
  - `<main className="max-w-7xl ...">` wrapper — pages render their own content inside
- **`<PageHeader>`** (`components/PageHeader.tsx`) — optional helper for consistent page title + subtitle + icon + action buttons
- **`<ProtectedPage>`** (`components/ProtectedPage.tsx`) — low-level auth gate only; do NOT use directly in pages, use `<AppShell>` instead
- **Home page (`app/page.tsx`)** is special: it handles its own unauthenticated login/loading screens, then wraps the authenticated dashboard in `<AppShell>`
- **Public pages** (`/review`, `/clarify`, `/privacy`, `/terms`) do NOT use `<AppShell>` — they have their own layouts
- Dialogs follow `TrackingHistoryDialog.tsx` pattern (fixed overlay, backdrop, gradient header)
- Shared Supabase client: `frontend/lib/supabaseClient.ts` (exports `supabase` + `callEdgeFunction`)
- Time entries page has two parallel views (grouped-by-customer and flat list) — both need matching updates

## Database

- `app_users` table has: `is_admin`, `can_edit_time`, `can_manage_users`, `can_view`, `can_send_reminders`, `can_create_invoices`
- `time_entries` has editing columns: `manually_edited`, `edit_count`, `updated_at`, `updated_by`
- `time_entry_audit_log` auto-tracks changes via DB trigger
- QB sync (`qb-time-sync/index.ts`) skips entries where `manually_edited = true`
- RLS: authenticated users can SELECT, service_role has full access

## Related Projects

- **playwright-test** — E2E tests for this frontend
- **FIT-David** — Shares Azure AD tenant
- **ChatGPTInspectionApp** — Shares Azure AD tenant
- **email_scrape** — Email automation overlap

## Email

- **From:** accounting@mitigationconsulting.com
- **Azure Graph API** used for sending weekly reports
- **MIT internal customers** have `email = 'accounting@mitigationconsulting.com'` so they receive all report flows (weekly, supplemental, follow-ups, auto-accept)
- Customer/project name is displayed prominently in all email headers via `emailHeader({ customerName })` parameter

## Build & Test

```bash
cd frontend
npx next build    # builds all pages as static export to out/
```

No TypeScript strict errors should be present. Always build before pushing to verify.

### API Tests (Playwright)

```bash
cd frontend
npx playwright test --project=api    # runs all API/edge function tests
```

Test suites in `frontend/tests/api/`:
- `health-checks.spec.ts` — verifies all edge functions deployed, DB tables exist, MIT customer email set
- `monitoring-functions.spec.ts` — invokes self-heal, health-digest, midweek-oversight, sync-customer-emails
- `schedule-config.spec.ts` — validates schedule_config entries

## Owner

David Sweet — david@mitigationconsulting.com
