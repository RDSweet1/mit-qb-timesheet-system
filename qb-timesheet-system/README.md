# QuickBooks Timesheet & Billing System

Automated weekly timesheet reminders + monthly invoice creation for QuickBooks Online.

## Quick Start

### 1. Test QuickBooks Connection

First, verify your OAuth tokens work:

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your credentials:
# - QB_ACCESS_TOKEN (from OAuth Playground)
# - QB_REFRESH_TOKEN (from OAuth Playground)
# - QB_REALM_ID (from OAuth Playground)

# Install dependencies and test
npm install
npm run test:qb
```

Or use the curl script (no npm needed):
```bash
# Edit test-qb-curl.sh with your ACCESS_TOKEN and REALM_ID
bash test-qb-curl.sh
```

### 2. Get QuickBooks OAuth Tokens

1. Go to https://developer.intuit.com/app/developer/playground
2. Select your app → Check "Accounting" scope
3. Click "Get authorization code" → Log in → Select company
4. Click "Get tokens"
5. Copy: Access Token, Refresh Token, Realm ID

### 3. Set Up Supabase

1. Create project at https://supabase.com
2. Run `sql/schema.sql` in SQL Editor
3. Copy your project URL and keys to `.env`

### 4. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link
supabase login
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy sync-service-items
supabase functions deploy qb-time-sync
supabase functions deploy send-reminder
supabase functions deploy create-invoices

# Set secrets
supabase secrets set QB_CLIENT_ID=your_client_id
supabase secrets set QB_CLIENT_SECRET=your_client_secret
# ... etc
```

## Project Structure

```
qb-timesheet-system/
├── .env.example          # Template for environment variables
├── package.json
├── test-qb-connection.js # Node.js test script
├── test-qb-curl.sh       # Bash/curl test script
├── sql/
│   └── schema.sql        # Database schema for Supabase
└── supabase/
    └── functions/
        ├── _shared/      # Shared utilities (Key Vault, etc.)
        ├── sync-service-items/
        ├── qb-time-sync/
        ├── send-reminder/
        └── create-invoices/
```

## Features

- **Weekly Reminders**: Automated email summaries to customers
- **Monthly Invoicing**: Create detailed invoices in QuickBooks with:
  - Date, Employee, Cost Code
  - Description, Notes (separate fields)
  - Time start/stop or lump sum hours
  - Rates from cost codes (service items)
- **Draft Mode**: Invoices created as drafts for review before sending

## Documentation

See the full spec in `qb-timesheet-microsoft-spec.md` for:
- Complete Edge Function code
- Azure Key Vault setup
- Microsoft Entra ID SSO
- pg_cron scheduling
