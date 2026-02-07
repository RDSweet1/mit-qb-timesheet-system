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

### DO NOT run `refresh-qb-time-token.js`

That script uses the **wrong credentials** (QB Online's `QB_CLIENT_ID` instead of the Workforce `QB_TIME_CLIENT_ID`). It will overwrite the working `S.27__` token in `.env` with a broken JWT token.

### How to verify the Workforce token works

```bash
curl -s -H "Authorization: Bearer S.27__0ca7c9d63ab6ca234b95869d4bf0c9322f8d4c0f" "https://rest.tsheets.com/api/v1/current_user"
```

If it returns user JSON → token is valid. If 401 → token expired, regenerate in Workforce admin (Feature Add-ons → API).

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

## Key Patterns

- Edge functions follow the Deno `serve()` pattern with `corsHeaders` and service role client
- Protected pages use `<ProtectedPage>` component wrapper
- Dialogs follow `TrackingHistoryDialog.tsx` pattern (fixed overlay, backdrop, gradient header)
- Shared Supabase client: `frontend/lib/supabaseClient.ts` (exports `supabase` + `callEdgeFunction`)
- Time entries page has two parallel views (grouped-by-customer and flat list) — both need matching updates

## Database

- `app_users` table has: `is_admin`, `can_edit_time`, `can_manage_users`, `can_view`, `can_send_reminders`, `can_create_invoices`
- `time_entries` has editing columns: `manually_edited`, `edit_count`, `updated_at`, `updated_by`
- `time_entry_audit_log` auto-tracks changes via DB trigger
- QB sync (`qb-time-sync/index.ts`) skips entries where `manually_edited = true`
- RLS: authenticated users can SELECT, service_role has full access

## Build & Test

```bash
cd frontend
npx next build    # builds all pages as static export to out/
```

No TypeScript strict errors should be present. Always build before pushing to verify.
