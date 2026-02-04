# Quick Supabase Secret Update

## The 30-Second Fix for QB Token Refresh

When QB tokens are refreshed, they need to be updated in Supabase for edge functions to use them.

### Super Fast Method:

1. Open: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/vault

2. Find and update these 3 secrets (click pencil icon):

   - `QB_ACCESS_TOKEN` - Copy from `.env` file (line 42)
   - `QB_REFRESH_TOKEN` - Copy from `.env` file (line 43)
   - `QB_REALM_ID` - Copy from `.env` file (line 44)

3. Done! The sync will now work.

### Current Values (from latest refresh):

```
QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..1nB546VcQ15ZGORVdS6iWA.uxdUGxMCOw25M3GOAfE9DmSMUy9sNByZv9W9cLTZuQgvPO6UKkzqQ_5_jDjzwKXGp8AK3ieo2cMMKQGuggEIM14dJyreBmoC1nEOt_AwJL3h3JrNrVQY08erZ0iVwrJPsSDWgZCd9UO4-yeAAKa0WX9wX-ezdgRD-imRjbKxwbiCc008lkvplJ5eQqyoeZi75CVWhcKat9JqQyfXuIgJ4cAXi5Vvt-qz-bzQItLpQSuFkDvFQPoT54kUhFNHYDQTQxPsGe1nTn7kcUEg2KGXFSj53CJUSTewLMkDBbmA-JxibNDgcyjBVKvLUtA9Pc7Wem0NFwTie1rlE3ndWcT2INhmr9YIXTzsSXb16W1N2fNGW5W1NyrwzX4uP-wmTu__9dg31fZ73ovseyD6vszZq99EHIS8uvpFOG_ofyxWq7m22rcUvpPzBOz6BhVnqEx0NwOsgN7fIvIQC2anKFUxVXnqRd_cl7MGPrdwGr3zHq5TSFj7Hiw8hLpkSNJezirpaItPssPc81lCnZa3pBjaWSpulmTMyMC4uSIwuEbuxMQpE2pdKbYiPf66RMHAEBaGzDaG5fKxQsPAv0z2-pV-BZnCA1idevzNqrjYbb9UYes.Rs_PeX6yhqLoMYqyUoS9zA

QB_REFRESH_TOKEN=RT1-36-H0-1778707792711klbo75bt8w9x1n65i

QB_REALM_ID=9341456256329564
```

---

## Why Manual (For Now)?

The Supabase Management API requires a **personal access token** (separate from service role key) to programmatically update secrets. While I have database access via the service role key, secret management is intentionally restricted for security.

## Future: Automation

To fully automate this, we could:
1. Get a Supabase personal access token
2. Store it securely
3. Use it in the automated script

But for security and simplicity, the 30-second manual update works great!
