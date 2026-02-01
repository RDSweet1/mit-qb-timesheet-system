# QuickBooks Online Time & Billing System
## Technical Specification — Supabase + Microsoft Integration

**Version:** 2.1  
**Date:** January 28, 2026  
**Purpose:** Weekly timesheet reminder emails + monthly invoice creation from QuickBooks Time entries

---

## Executive Summary

This system integrates:

| Component | Purpose |
|-----------|---------|
| **Supabase** | Database, Edge Functions, scheduling (pg_cron) |
| **Microsoft Entra ID** | Employee SSO authentication |
| **Azure Key Vault** | Secure storage for QuickBooks OAuth tokens |
| **QuickBooks Online** | Read TimeActivity, create Invoices |
| **Resend** | Email delivery for weekly reminders |

**Key Capabilities:**
- Read time entries from QuickBooks (synced from Workforce)
- Send weekly reminder emails to customers with time summary
- **Create monthly invoices in QuickBooks** from accumulated billable time
- Mark time entries as "HasBeenBilled" after invoicing
- SSO for employees via existing Microsoft accounts
- Dashboard to trigger billing runs and view status

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EMPLOYEE ACCESS                                 │
│                                                                             │
│    ┌──────────────┐         ┌──────────────────────┐                       │
│    │  Web App     │────────▶│  Microsoft Entra ID  │                       │
│    │  (Next.js)   │◀────────│  (SSO / OAuth)       │                       │
│    └──────┬───────┘         └──────────────────────┘                       │
│           │                                                                 │
│           │  Actions:                                                       │
│           │  • View time by customer/period                                 │
│           │  • Send weekly reminder emails                                  │
│           │  • Trigger monthly invoice creation                             │
│           │                                                                 │
└───────────┼─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE PROJECT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Edge Function   │  │  Edge Function   │  │  Edge Function   │          │
│  │  qb-time-sync    │  │  send-reminder   │  │  create-invoices │          │
│  │  (Read from QB)  │  │  (Weekly emails) │  │  (Monthly billing)│          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 │                                           │
│  ┌──────────────────────────────┴────────────────────────────────────────┐  │
│  │                      PostgreSQL Database                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐ │  │
│  │  │ customers   │ │time_entries │ │ email_log   │ │ invoice_log      │ │  │
│  │  │ (cache)     │ │ (cache)     │ │             │ │ (billing runs)   │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        pg_cron Scheduler                             │   │
│  │         Weekly: Monday 8 AM → send-reminder                          │   │
│  │         Daily: 3 AM → token refresh check                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
            │                                   │
            ▼                                   ▼
┌───────────────────┐                ┌───────────────────┐
│  Azure Key Vault  │                │  QuickBooks API   │
│  (QB OAuth Tokens)│                │  • TimeActivity   │
└───────────────────┘                │  • Invoice        │
                                     │  • Customer       │
                                     └───────────────────┘
```

### Core Workflows

**Weekly Reminder (Automated)**
1. pg_cron triggers `send-reminder` Monday 8 AM
2. Sync latest time from QuickBooks
3. For each customer with billable time: send HTML email summary
4. Log email delivery

**Monthly Invoice Creation (Manual Trigger)**
1. Employee triggers `create-invoices` from dashboard
2. For each customer: query unbilled time for prior month
3. Create Invoice in QuickBooks with line items
4. Update TimeActivity records → BillableStatus = "HasBeenBilled"
5. Log invoice creation

---

## Microsoft Entra ID Configuration

### App Registration for Employee SSO

1. **Create App Registration** in Azure Portal → Microsoft Entra ID → App registrations

2. **Configure Authentication:**
   - Platform: Single-page application (SPA)
   - Redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
   - Supported account types: Accounts in this organizational directory only

3. **API Permissions:**
   ```
   Microsoft Graph:
   - User.Read (delegated) — Sign in and read user profile
   ```

4. **Collect credentials:**
   - Application (client) ID
   - Directory (tenant) ID
   - Client secret (create under Certificates & secrets)

### Supabase Azure OAuth Setup

```typescript
// In Supabase Dashboard: Authentication → Providers → Azure

// Or via API:
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'azure',
  options: {
    scopes: 'email profile User.Read',
    redirectTo: 'https://your-app.com/auth/callback'
  }
});
```

**Supabase Dashboard Configuration:**
- Provider: Azure (Microsoft)
- Azure Tenant URL: `https://login.microsoftonline.com/YOUR-TENANT-ID`
- Client ID: From app registration
- Client Secret: From app registration

---

## Azure Key Vault Configuration

### Why Key Vault for QB Tokens

QuickBooks OAuth tokens require:
- Secure storage (refresh tokens are sensitive)
- Automatic rotation handling
- Audit logging for compliance
- No exposure in database or code

### Key Vault Setup

1. **Create Key Vault** in Azure Portal
2. **Configure Access Policy** for your Entra ID app:
   - Secret permissions: Get, Set, Delete, List

3. **Store Secrets:**
   ```
   qb-access-token
   qb-refresh-token
   qb-realm-id
   qb-token-expires-at
   ```

### App Registration for Key Vault Access

Create a **separate** app registration for server-to-server Key Vault access:

```
API Permissions:
- Azure Key Vault: user_impersonation (delegated)
```

Or use **managed identity** if hosting on Azure (not applicable for Supabase Edge Functions).

### Key Vault REST API from Edge Functions

```typescript
// supabase/functions/_shared/keyvault.ts

const TENANT_ID = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_KV_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_KV_CLIENT_SECRET")!;
const VAULT_NAME = Deno.env.get("AZURE_VAULT_NAME")!;

interface KeyVaultSecret {
  value: string;
  id: string;
}

// Get Azure AD token for Key Vault
async function getKeyVaultToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://vault.azure.net/.default",
      grant_type: "client_credentials"
    })
  });
  
  const data = await response.json();
  return data.access_token;
}

// Get secret from Key Vault
export async function getSecret(secretName: string): Promise<string> {
  const token = await getKeyVaultToken();
  const url = `https://${VAULT_NAME}.vault.azure.net/secrets/${secretName}?api-version=2016-10-01`;
  
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  const data: KeyVaultSecret = await response.json();
  return data.value;
}

// Set secret in Key Vault
export async function setSecret(secretName: string, value: string): Promise<void> {
  const token = await getKeyVaultToken();
  const url = `https://${VAULT_NAME}.vault.azure.net/secrets/${secretName}?api-version=2016-10-01`;
  
  await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ value })
  });
}

// Get all QB tokens at once
export async function getQBTokens() {
  const [accessToken, refreshToken, realmId, expiresAt] = await Promise.all([
    getSecret("qb-access-token"),
    getSecret("qb-refresh-token"),
    getSecret("qb-realm-id"),
    getSecret("qb-token-expires-at")
  ]);
  
  return { accessToken, refreshToken, realmId, expiresAt: new Date(expiresAt) };
}

// Update QB tokens after refresh
export async function updateQBTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  
  await Promise.all([
    setSecret("qb-access-token", accessToken),
    setSecret("qb-refresh-token", refreshToken),
    setSecret("qb-token-expires-at", expiresAt)
  ]);
}
```

---

## Database Schema

```sql
-- Customers cache (synced from QuickBooks)
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  qb_customer_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  net_terms INTEGER DEFAULT 0,  -- 0 = Due on Receipt (completion)
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service items / Cost codes (synced from QuickBooks)
-- RATES ARE STORED HERE, NOT ON CUSTOMER
-- Short codes derived from item names (e.g., "Expert Witness - Deposition" → "EXPERT-DEPO")
CREATE TABLE service_items (
  id SERIAL PRIMARY KEY,
  qb_item_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,           -- e.g., "Expert Witness - Deposition"
  code TEXT,                    -- Derived short code e.g., "EXPERT-DEPO"
  description TEXT,
  unit_price DECIMAL(10,2) NOT NULL,  -- Rate for this cost code
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time entries cache (synced from QuickBooks)
-- Contains all fields needed for detailed invoice line items
CREATE TABLE time_entries (
  id SERIAL PRIMARY KEY,
  qb_time_id TEXT UNIQUE NOT NULL,
  qb_sync_token TEXT,  -- needed for updates
  
  -- Core references
  qb_customer_id TEXT NOT NULL,
  qb_employee_id TEXT NOT NULL,
  employee_name TEXT,
  
  -- Date and time (supports BOTH clock in/out AND lump sum)
  txn_date DATE NOT NULL,
  start_time TIMESTAMPTZ,       -- NULL for lump sum entries
  end_time TIMESTAMPTZ,         -- NULL for lump sum entries
  hours INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  
  -- Cost code / Service item (RATE COMES FROM HERE)
  qb_item_id TEXT,              -- FK to service_items
  cost_code TEXT,               -- Display code (e.g., "EXPERT-DEPO")
  service_item_name TEXT,       -- Full name
  
  -- Work details - SEPARATE FIELDS
  description TEXT,             -- Description of work performed
  notes TEXT,                   -- Additional notes (separate field in Workforce)
  
  -- Billing
  billable_status TEXT,         -- Billable, NotBillable, HasBeenBilled
  
  -- Sync tracking
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  FOREIGN KEY (qb_customer_id) REFERENCES customers(qb_customer_id),
  FOREIGN KEY (qb_item_id) REFERENCES service_items(qb_item_id)
);

-- Indexes for common queries
CREATE INDEX idx_time_entries_customer_date ON time_entries(qb_customer_id, txn_date);
CREATE INDEX idx_time_entries_billable ON time_entries(billable_status) WHERE billable_status = 'Billable';
CREATE INDEX idx_time_entries_item ON time_entries(qb_item_id);

-- Invoice creation log
CREATE TABLE invoice_log (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  qb_invoice_id TEXT,           -- QuickBooks Invoice ID
  qb_invoice_number TEXT,       -- DocNumber in QB
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  total_hours DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  line_item_count INTEGER,
  time_entry_ids TEXT[],        -- Array of QB TimeActivity IDs included
  status TEXT DEFAULT 'created',  -- created, sent, paid, voided
  created_by TEXT,              -- Employee email who triggered
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate invoices for same period
  UNIQUE(customer_id, billing_period_start, billing_period_end)
);

-- Email log (weekly reminders)
CREATE TABLE email_log (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  email_type TEXT DEFAULT 'weekly_reminder',
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours DECIMAL(10,2),
  estimated_amount DECIMAL(10,2),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_id TEXT
);

-- App users (synced from Entra ID on login)
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  can_view BOOLEAN DEFAULT true,
  can_send_reminders BOOLEAN DEFAULT false,
  can_create_invoices BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read" ON time_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read" ON customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read" ON invoice_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read" ON service_items
  FOR SELECT TO authenticated USING (true);
```

### Key Design Decisions

| Requirement | Implementation |
|-------------|----------------|
| **Rates by cost code** | `service_items.unit_price` — NOT on customer |
| **Notes separate from description** | Two columns: `description`, `notes` |
| **Clock in/out AND lump sum** | `start_time`/`end_time` nullable; always have `hours`/`minutes` |
| **Cost code display** | `cost_code` for short code, `service_item_name` for full name |

---

## Edge Functions

### 1. sync-service-items (Sync Cost Codes from QuickBooks)

Run this once initially, then periodically to keep rates current. **Derives short codes from item names.**

```typescript
// supabase/functions/sync-service-items/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getQBTokens } from "../_shared/keyvault.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req: Request) => {
  try {
    let tokens = await getQBTokens();
    if (tokens.expiresAt < new Date()) {
      tokens = await refreshQBTokens(tokens.refreshToken);
    }
    
    // Query all active Service items from QuickBooks
    const query = `SELECT * FROM Item WHERE Type = 'Service' AND Active = true`;
    
    const qbResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/text",
          "Accept": "application/json"
        },
        body: query
      }
    );
    
    const qbData = await qbResponse.json();
    const items = qbData.QueryResponse?.Item || [];
    
    // Upsert into service_items table
    for (const item of items) {
      await supabase.from("service_items").upsert({
        qb_item_id: item.Id,
        name: item.Name,
        code: deriveShortCode(item.Name),  // Derive from name
        description: item.Description,
        unit_price: item.UnitPrice || 0,
        is_active: item.Active,
        synced_at: new Date().toISOString()
      }, { onConflict: "qb_item_id" });
    }
    
    return new Response(JSON.stringify({
      success: true,
      count: items.length
    }), { headers: { "Content-Type": "application/json" } });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

/**
 * Derive short code from service item name
 * Examples:
 *   "Expert Witness - Deposition" → "EXPERT-DEPO"
 *   "Expert Witness - Report Writing" → "EXPERT-REPORT"
 *   "Document Review" → "DOC-REVIEW"
 *   "Site Inspection" → "SITE-INSP"
 */
function deriveShortCode(name: string): string {
  // Split on common separators
  const parts = name
    .replace(/[–—]/g, '-')  // Normalize dashes
    .split(/[-:]/);
  
  if (parts.length >= 2) {
    // Take first word of each part, uppercase, truncate
    const prefix = parts[0].trim().split(/\s+/)[0].toUpperCase().substring(0, 6);
    const suffix = parts[1].trim().split(/\s+/)[0].toUpperCase().substring(0, 6);
    return `${prefix}-${suffix}`;
  }
  
  // Single part: take first two words
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0].toUpperCase().substring(0, 4)}-${words[1].toUpperCase().substring(0, 6)}`;
  }
  
  // Fallback: just uppercase and truncate
  return name.toUpperCase().replace(/\s+/g, '-').substring(0, 12);
}
```

### 2. qb-time-sync (Read TimeActivity from QuickBooks)

Syncs TimeActivity records with separate notes field and cost code reference:

```typescript
// supabase/functions/qb-time-sync/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getQBTokens, updateQBTokens } from "../_shared/keyvault.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID")!;
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req: Request) => {
  try {
    const { customerId, startDate, endDate, billableOnly } = await req.json();
    
    // Get tokens from Azure Key Vault
    let tokens = await getQBTokens();
    
    // Refresh if expired
    if (tokens.expiresAt < new Date()) {
      tokens = await refreshQBTokens(tokens.refreshToken);
    }
    
    // Build query
    let query = `SELECT * FROM TimeActivity WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`;
    if (customerId) {
      query += ` AND CustomerRef = '${customerId}'`;
    }
    if (billableOnly !== false) {
      query += ` AND BillableStatus = 'Billable'`;
    }
    
    // Call QuickBooks API
    const qbResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/text",
          "Accept": "application/json"
        },
        body: query
      }
    );
    
    const qbData = await qbResponse.json();
    const timeActivities = qbData.QueryResponse?.TimeActivity || [];
    
    // Cache in Supabase with all detail fields
    for (const ta of timeActivities) {
      // Get cost code from our service_items table for the short code
      let costCode = ta.ItemRef?.name || null;
      if (ta.ItemRef?.value) {
        const { data: serviceItem } = await supabase
          .from("service_items")
          .select("code")
          .eq("qb_item_id", ta.ItemRef.value)
          .single();
        if (serviceItem?.code) {
          costCode = serviceItem.code;
        }
      }
      
      await supabase.from("time_entries").upsert({
        qb_time_id: ta.Id,
        qb_sync_token: ta.SyncToken,
        
        // Core references
        qb_customer_id: ta.CustomerRef?.value,
        qb_employee_id: ta.EmployeeRef?.value,
        employee_name: ta.EmployeeRef?.name,
        
        // Date and time - supports BOTH clock in/out AND lump sum
        txn_date: ta.TxnDate,
        start_time: ta.StartTime || null,  // ISO datetime if clock in/out
        end_time: ta.EndTime || null,      // ISO datetime if clock in/out
        hours: ta.Hours || 0,
        minutes: ta.Minutes || 0,
        
        // Cost code / Service item (for rate lookup)
        qb_item_id: ta.ItemRef?.value || null,
        cost_code: costCode,
        service_item_name: ta.ItemRef?.name || null,
        
        // Work details - SEPARATE FIELDS
        // QB TimeActivity has Description; Notes come from Workforce sync
        // If Description contains "Notes:" we split it, otherwise notes is separate
        description: ta.Description || null,
        notes: ta.Notes || null,  // QB Time/Workforce syncs notes separately
        
        // Billing
        billable_status: ta.BillableStatus,
        
        synced_at: new Date().toISOString()
      }, { onConflict: "qb_time_id" });
    }
    
    return new Response(JSON.stringify({
      success: true,
      count: timeActivities.length,
      data: timeActivities
    }), { headers: { "Content-Type": "application/json" } });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

async function refreshQBTokens(refreshToken: string) {
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );
  
  const data = await response.json();
  
  // CRITICAL: Store new tokens in Key Vault (refresh token may rotate)
  await updateQBTokens(data.access_token, data.refresh_token, data.expires_in);
  
  const { getSecret } = await import("../_shared/keyvault.ts");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    realmId: await getSecret("qb-realm-id"),
    expiresAt: new Date(Date.now() + data.expires_in * 1000)
  };
}
```

**QuickBooks TimeActivity Fields Captured:**

| QB Field | Our Field | Purpose |
|----------|-----------|---------|
| `Id` | `qb_time_id` | Unique identifier |
| `SyncToken` | `qb_sync_token` | Required for updates |
| `EmployeeRef.value/name` | `qb_employee_id`, `employee_name` | Who did the work |
| `CustomerRef.value` | `qb_customer_id` | Client reference |
| `TxnDate` | `txn_date` | Date of work |
| `StartTime` | `start_time` | Clock-in (NULL for lump sum) |
| `EndTime` | `end_time` | Clock-out (NULL for lump sum) |
| `Hours`, `Minutes` | `hours`, `minutes` | Duration (always populated) |
| `ItemRef.value/name` | `qb_item_id`, `cost_code` | Service item for rate lookup |
| `Description` | `description` | Work description |
| `Notes` | `notes` | Separate notes field |
| `BillableStatus` | `billable_status` | Billing state |

### 3. send-reminder (Weekly Email Reminders)

```typescript
// supabase/functions/send-reminder/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req: Request) => {
  try {
    // Calculate last week range (Monday to Sunday)
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    
    const startDate = lastMonday.toISOString().split("T")[0];
    const endDate = lastSunday.toISOString().split("T")[0];
    
    // Sync latest time from QuickBooks
    await fetch(`${SUPABASE_URL}/functions/v1/qb-time-sync`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ startDate, endDate })
    });
    
    // Get active customers with email
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .eq("is_active", true)
      .not("email", "is", null);
    
    const results = [];
    
    for (const customer of customers || []) {
      // Get billable time entries for this customer
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("qb_customer_id", customer.qb_customer_id)
        .eq("billable_status", "Billable")
        .gte("txn_date", startDate)
        .lte("txn_date", endDate)
        .order("txn_date", { ascending: true });
      
      if (!entries || entries.length === 0) continue;
      
      // Calculate totals
      const totalMinutes = entries.reduce((sum, e) => sum + (e.hours * 60) + e.minutes, 0);
      const totalHours = totalMinutes / 60;
      const rate = customer.billing_rate || 0;
      const estimatedAmount = totalHours * rate;
      
      // Generate simple HTML email
      const emailHtml = generateReminderEmail(
        customer.display_name,
        entries,
        totalHours,
        estimatedAmount,
        startDate,
        endDate
      );
      
      // Send via Resend
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: customer.email,
          subject: `Weekly Time Summary: ${startDate} to ${endDate}`,
          html: emailHtml
        })
      });
      
      const emailResult = await emailResponse.json();
      
      // Log
      await supabase.from("email_log").insert({
        customer_id: customer.id,
        email_type: "weekly_reminder",
        week_start: startDate,
        week_end: endDate,
        total_hours: totalHours,
        estimated_amount: estimatedAmount,
        resend_id: emailResult.id
      });
      
      results.push({
        customer: customer.display_name,
        hours: totalHours,
        emailSent: emailResponse.ok
      });
    }
    
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

function generateReminderEmail(
  customerName: string,
  entries: any[],
  totalHours: number,
  estimatedAmount: number,
  startDate: string,
  endDate: string
): string {
  const rows = entries.map(e => {
    const hours = e.hours + (e.minutes / 60);
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.txn_date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${hours.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.description || '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c5282; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f7fafc; padding: 10px; text-align: left; }
        .total { font-size: 18px; font-weight: bold; margin: 20px 0; padding: 15px; background: #f7fafc; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Weekly Time Summary</h1>
        </div>
        
        <div class="content">
          <p>Dear ${customerName},</p>
          
          <p>Here's a summary of time tracked for your account from <strong>${startDate}</strong> to <strong>${endDate}</strong>:</p>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Hours</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          
          <div class="total">
            <p>Total Hours: ${totalHours.toFixed(2)}</p>
            ${estimatedAmount > 0 ? `<p>Estimated Amount: $${estimatedAmount.toFixed(2)}</p>` : ''}
          </div>
          
          <p><em>This is a preview of time tracked this week. Final amounts will appear on your monthly invoice.</em></p>
        </div>
        
        <div class="footer">
          <p>Questions about this summary? Please reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
```

### 4. create-invoices (Monthly Billing - QB Invoice Creation)

Creates invoices as **drafts for review** (not emailed automatically). Once process is refined, can add email step.

Each invoice has **detailed line items** showing date, employee, cost code, description, notes, and time start/stop. **Rates come from cost codes (service items), not customers. Terms default to Due on Receipt.**

```typescript
// supabase/functions/create-invoices/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getQBTokens, updateQBTokens } from "../_shared/keyvault.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID")!;
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface InvoiceRequest {
  customerId?: string;  // Optional: specific customer, or all if omitted
  periodStart: string;  // e.g., "2026-01-01"
  periodEnd: string;    // e.g., "2026-01-31"
  createdBy: string;    // Employee email who triggered
}

serve(async (req: Request) => {
  try {
    const { customerId, periodStart, periodEnd, createdBy }: InvoiceRequest = await req.json();
    
    // Get tokens
    let tokens = await getQBTokens();
    if (tokens.expiresAt < new Date()) {
      tokens = await refreshQBTokens(tokens.refreshToken);
    }
    
    // First sync the latest time data for the period
    await fetch(`${SUPABASE_URL}/functions/v1/qb-time-sync`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        customerId, 
        startDate: periodStart, 
        endDate: periodEnd,
        billableOnly: true 
      })
    });
    
    // Load all service items for rate lookup
    const { data: serviceItems } = await supabase
      .from("service_items")
      .select("qb_item_id, code, name, unit_price");
    
    const ratesByItemId: Record<string, number> = {};
    for (const item of serviceItems || []) {
      ratesByItemId[item.qb_item_id] = item.unit_price;
    }
    
    // Get customers to invoice
    let customersQuery = supabase
      .from("customers")
      .select("*")
      .eq("is_active", true);
    
    if (customerId) {
      customersQuery = customersQuery.eq("qb_customer_id", customerId);
    }
    
    const { data: customers } = await customersQuery;
    const results = [];
    
    for (const customer of customers || []) {
      // Get unbilled time entries for this customer in the period
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*")
        .eq("qb_customer_id", customer.qb_customer_id)
        .eq("billable_status", "Billable")
        .gte("txn_date", periodStart)
        .lte("txn_date", periodEnd)
        .order("txn_date", { ascending: true })
        .order("start_time", { ascending: true });
      
      if (!entries || entries.length === 0) {
        results.push({ customer: customer.display_name, status: "skipped", reason: "no billable time" });
        continue;
      }
      
      // Validate all entries have cost codes with rates
      const missingRates = entries.filter(e => !e.qb_item_id || !ratesByItemId[e.qb_item_id]);
      if (missingRates.length > 0) {
        results.push({ 
          customer: customer.display_name, 
          status: "skipped", 
          reason: `${missingRates.length} entries missing cost code/rate`
        });
        continue;
      }
      
      // Build DETAILED invoice line items - one per time entry
      // Rate comes from service_items based on cost code
      const lineItems = entries.map((entry, idx) => {
        const hours = entry.hours + (entry.minutes / 60);
        const rate = ratesByItemId[entry.qb_item_id];  // RATE FROM COST CODE
        const amount = hours * rate;
        
        // Build rich description with all details
        const descriptionLines = [
          `Date: ${formatDate(entry.txn_date)} | Employee: ${entry.employee_name || 'Staff'}`,
          `Cost Code: ${entry.cost_code || entry.service_item_name || 'Services'}`,
          `Description: ${entry.description || 'Professional services'}`,
        ];
        
        // Add notes if present (SEPARATE FIELD)
        if (entry.notes) {
          descriptionLines.push(`Notes: ${entry.notes}`);
        }
        
        // Add time start/stop if clock in/out, otherwise just duration
        if (entry.start_time && entry.end_time) {
          descriptionLines.push(`Time: ${formatTime(entry.start_time)} - ${formatTime(entry.end_time)} (${hours.toFixed(2)} hrs)`);
        } else {
          descriptionLines.push(`Duration: ${hours.toFixed(2)} hrs`);
        }
        
        return {
          Id: String(idx + 1),
          LineNum: idx + 1,
          Amount: Math.round(amount * 100) / 100,
          DetailType: "SalesItemLineDetail",
          Description: descriptionLines.join("\n"),
          SalesItemLineDetail: {
            ItemRef: { value: entry.qb_item_id },  // Use the cost code item
            Qty: Math.round(hours * 100) / 100,
            UnitPrice: rate
          }
        };
      });
      
      // Calculate totals
      const totalMinutes = entries.reduce((sum, e) => sum + (e.hours * 60) + e.minutes, 0);
      const totalHours = totalMinutes / 60;
      const totalAmount = lineItems.reduce((sum, li) => sum + li.Amount, 0);
      
      // Create Invoice in QuickBooks
      const invoicePayload = {
        CustomerRef: { value: customer.qb_customer_id },
        TxnDate: new Date().toISOString().split("T")[0],
        DueDate: getDueDate(customer.net_terms || 30),
        PrivateNote: `Billing period: ${periodStart} to ${periodEnd}\nGenerated by: ${createdBy}`,
        Line: lineItems
      };
      
      // POST to QuickBooks
      const invoiceResponse = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}/invoice?minorversion=75`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(invoicePayload)
        }
      );
      
      const invoiceResult = await invoiceResponse.json();
      
      if (!invoiceResponse.ok) {
        results.push({ 
          customer: customer.display_name, 
          status: "failed", 
          error: invoiceResult.Fault?.Error?.[0]?.Message || JSON.stringify(invoiceResult)
        });
        continue;
      }
      
      const invoice = invoiceResult.Invoice;
      
      // Mark time entries as billed in QuickBooks
      await markTimeEntriesAsBilled(tokens, entries);
      
      // Update local cache
      for (const entry of entries) {
        await supabase
          .from("time_entries")
          .update({ billable_status: "HasBeenBilled" })
          .eq("qb_time_id", entry.qb_time_id);
      }
      
      // Log the invoice
      await supabase.from("invoice_log").insert({
        customer_id: customer.id,
        qb_invoice_id: invoice.Id,
        qb_invoice_number: invoice.DocNumber,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        total_hours: totalHours,
        total_amount: invoice.TotalAmt,
        line_item_count: entries.length,
        time_entry_ids: entries.map(e => e.qb_time_id),
        status: "created",
        created_by: createdBy
      });
      
      results.push({
        customer: customer.display_name,
        status: "success",
        invoiceId: invoice.Id,
        invoiceNumber: invoice.DocNumber,
        lineItems: entries.length,
        totalHours: totalHours,
        totalAmount: invoice.TotalAmt
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      periodStart,
      periodEnd,
      results 
    }), {
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

// Format date as MM/DD/YYYY
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// Format time as h:MM AM/PM
function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

// Mark time entries as "HasBeenBilled" in QuickBooks
async function markTimeEntriesAsBilled(tokens: any, entries: any[]) {
  for (const entry of entries) {
    try {
      await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${tokens.realmId}/timeactivity?minorversion=75`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            Id: entry.qb_time_id,
            SyncToken: entry.qb_sync_token,
            BillableStatus: "HasBeenBilled",
            sparse: true
          })
        }
      );
    } catch (e) {
      console.error(`Failed to mark entry ${entry.qb_time_id} as billed:`, e);
    }
  }
}

function getDueDate(days: number): string {
  const date = new Date();
  if (days > 0) {
    date.setDate(date.getDate() + days);
  }
  // If days is 0, due date = invoice date (due on receipt)
  return date.toISOString().split("T")[0];
}

async function refreshQBTokens(refreshToken: string) {
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );
  
  const data = await response.json();
  await updateQBTokens(data.access_token, data.refresh_token, data.expires_in);
  
  const { getSecret } = await import("../_shared/keyvault.ts");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    realmId: await getSecret("qb-realm-id"),
    expiresAt: new Date(Date.now() + data.expires_in * 1000)
  };
}
```

### Invoice Line Item Example

Each time entry becomes one line item on the invoice with this format:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Line 1                                                          $450.00    │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Date: 01/15/2026 | Employee: John Smith                                    │
│ Cost Code: EXPERT-DEPO                                                     │
│ Description: Reviewed plaintiff deposition for Building 130 case           │
│ Notes: Pages 45-120, focused on moisture intrusion timeline                │
│ Time: 8:00 AM - 12:00 PM (4.00 hrs)                                       │
│                                                            Qty: 4.00 @ $112.50 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Line 2                                                          $281.25    │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Date: 01/16/2026 | Employee: John Smith                                    │
│ Cost Code: EXPERT-REPORT                                                   │
│ Description: Draft expert report section on drying protocol deficiencies   │
│ Notes: Referenced IICRC S500 standards, created equipment timeline         │
│ Time: 1:00 PM - 3:30 PM (2.50 hrs)                                        │
│                                                            Qty: 2.50 @ $112.50 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                      TOTAL:     $731.25    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scheduling with pg_cron

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Weekly reminder emails - Monday 8 AM EST (13:00 UTC)
SELECT cron.schedule(
  'weekly-reminder-emails',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily token refresh check - 3 AM EST (08:00 UTC)
SELECT cron.schedule(
  'daily-token-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/qb-time-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
    ),
    body := '{"startDate": "2026-01-01", "endDate": "2026-01-01"}'::jsonb
  );
  $$
);

-- NOTE: Invoice creation is triggered manually from dashboard, not scheduled
```

---

## Employee Web Dashboard

### Features

1. **View Time by Customer** — Query cached time entries
2. **Send Weekly Reminders** — Manual trigger for email reminders
3. **Create Monthly Invoices** — Select period, preview, and create invoices in QB
4. **View Invoice History** — See past billing runs

### Next.js App with Entra ID SSO

```typescript
// app/auth/callback/route.ts (Next.js App Router)
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

```typescript
// components/LoginButton.tsx
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function LoginButton() {
  const supabase = createClientComponentClient();

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile User.Read',
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
  };

  return (
    <button onClick={handleLogin} className="btn-primary">
      Sign in with Microsoft
    </button>
  );
}
```

### Invoice Creation Component

```typescript
// components/CreateInvoices.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateInvoices({ userEmail }: { userEmail: string }) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  const supabase = createClientComponentClient();

  // Default to previous month
  const setPreviousMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    setPeriodStart(firstDay.toISOString().split('T')[0]);
    setPeriodEnd(lastDay.toISOString().split('T')[0]);
  };

  const handleCreateInvoices = async () => {
    if (!periodStart || !periodEnd) {
      alert('Please select a billing period');
      return;
    }
    
    if (!confirm(`Create invoices for all customers with billable time from ${periodStart} to ${periodEnd}?`)) {
      return;
    }
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-invoices`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            periodStart,
            periodEnd,
            createdBy: userEmail
          })
        }
      );
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Error creating invoices:', error);
      alert('Failed to create invoices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Create Monthly Invoices</h2>
      
      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Period Start</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Period End</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={setPreviousMonth}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Previous Month
          </button>
        </div>
      </div>
      
      <button
        onClick={handleCreateInvoices}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creating Invoices...' : 'Create Invoices in QuickBooks'}
      </button>
      
      {results && (
        <div className="mt-6">
          <h3 className="font-bold mb-2">Results:</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Customer</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Invoice #</th>
                <th className="border p-2 text-right">Hours</th>
                <th className="border p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {results.results?.map((r: any, i: number) => (
                <tr key={i} className={r.status === 'success' ? 'bg-green-50' : 'bg-red-50'}>
                  <td className="border p-2">{r.customer}</td>
                  <td className="border p-2">{r.status}</td>
                  <td className="border p-2">{r.invoiceNumber || r.reason || r.error}</td>
                  <td className="border p-2 text-right">{r.totalHours?.toFixed(2) || '-'}</td>
                  <td className="border p-2 text-right">{r.totalAmount ? `$${r.totalAmount.toFixed(2)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## Deployment Checklist

### Azure Setup
- [ ] Create App Registration for employee SSO (User.Read permission only)
- [ ] Create App Registration for Key Vault access (service principal)
- [ ] Create Azure Key Vault
- [ ] Configure Key Vault access policies for the service principal
- [ ] Grant admin consent for API permissions

### QuickBooks Setup
- [ ] Register app at developer.intuit.com
- [ ] Complete OAuth flow
- [ ] Store tokens in Azure Key Vault
- [ ] Note your Service Item ID for invoice line items (e.g., "Consulting Services")
- [ ] Set up customer billing rates in QuickBooks or Supabase

### Supabase Setup
- [ ] Create project
- [ ] Run database schema
- [ ] Enable pg_cron and pg_net extensions
- [ ] Configure Azure OAuth provider
- [ ] Deploy Edge Functions
- [ ] Set secrets (see below)
- [ ] Schedule cron jobs

### Secrets to Configure

```bash
# QuickBooks
supabase secrets set QB_CLIENT_ID=your_qb_client_id
supabase secrets set QB_CLIENT_SECRET=your_qb_client_secret
supabase secrets set QB_SERVICE_ITEM_ID=your_service_item_id  # for invoice line items

# Azure Key Vault
supabase secrets set AZURE_TENANT_ID=your_tenant_id
supabase secrets set AZURE_KV_CLIENT_ID=keyvault_app_client_id
supabase secrets set AZURE_KV_CLIENT_SECRET=keyvault_app_secret
supabase secrets set AZURE_VAULT_NAME=your_vault_name

# Email
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set FROM_EMAIL=timesheets@yourdomain.com
```

### Key Vault Secrets (stored in Azure)
```
qb-access-token      — QuickBooks access token
qb-refresh-token     — QuickBooks refresh token (rotates!)
qb-realm-id          — QuickBooks company ID
qb-token-expires-at  — Token expiration timestamp
```

---

## Estimated Costs

| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro | $25 |
| Azure Key Vault | ~$1-3 |
| Resend (3,000 emails) | Free |
| QuickBooks Online Essentials | $54-65 |
| **Total** | **~$80-95/month** |

---

## Security Summary

| Component | Security Measure |
|-----------|-----------------|
| Employee Auth | Entra ID SSO with MFA |
| QB Tokens | Azure Key Vault (FIPS 140-2 compliant) |
| Database | Supabase RLS + service role isolation |
| API Calls | Bearer tokens, HTTPS only |
| Secrets | Never in code, environment variables only |
| Invoice Creation | Requires authenticated user, logged with email |

---

## Invoice Creation Flow (Detailed)

```
Employee Dashboard                    Supabase                           QuickBooks
       │                                  │                                   │
       │  1. Click "Create Invoices"      │                                   │
       │  (select period: Jan 1-31)       │                                   │
       │────────────────────────────────▶│                                   │
       │                                  │                                   │
       │                                  │  2. Sync latest time from QB      │
       │                                  │─────────────────────────────────▶│
       │                                  │◀─────────────────────────────────│
       │                                  │                                   │
       │                                  │  3. For each customer:            │
       │                                  │     - Query unbilled time         │
       │                                  │     - Calculate totals            │
       │                                  │     - Build invoice payload       │
       │                                  │                                   │
       │                                  │  4. POST /invoice                 │
       │                                  │─────────────────────────────────▶│
       │                                  │◀─────────────────────────────────│
       │                                  │     Invoice created (ID, DocNum)  │
       │                                  │                                   │
       │                                  │  5. Update TimeActivity           │
       │                                  │     BillableStatus = HasBeenBilled│
       │                                  │─────────────────────────────────▶│
       │                                  │◀─────────────────────────────────│
       │                                  │                                   │
       │                                  │  6. Log to invoice_log table      │
       │                                  │                                   │
       │  7. Show results table           │                                   │
       │◀────────────────────────────────│                                   │
       │                                  │                                   │
```

---

## Next Steps

1. **Phase 1:** Azure setup (Entra ID app, Key Vault)
2. **Phase 2:** QuickBooks OAuth flow → store tokens in Key Vault  
3. **Phase 3:** Deploy Supabase Edge Functions (`qb-time-sync`, `send-reminder`)
4. **Phase 4:** Test weekly reminders
5. **Phase 5:** Deploy `create-invoices` function
6. **Phase 6:** Build employee dashboard with SSO
7. **Phase 7:** Enable cron scheduling and go live

---

## Finalized Decisions

| Question | Answer | Implementation |
|----------|--------|----------------|
| Cost codes | QB Service Items | `service_items` table with rates |
| Short codes | Derived from names | `deriveShortCode()` function |
| Notes field | Separate from description | Two columns in `time_entries` |
| Time tracking | Both clock in/out AND lump sum | `start_time`/`end_time` nullable |
| Billing rates | By cost code | Lookup from `service_items.unit_price` |
| Payment terms | Due on receipt | `net_terms = 0` (due date = invoice date) |
| Invoice flow | Create as draft, review first | No auto-email; review in QB then send manually |

**Future Enhancement:** Once invoicing process is refined, add `send-invoice` function to email directly from the app.
