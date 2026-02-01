# Configure QuickBooks Secrets in Supabase

## Problem
The QB sync is failing with `invalid_client` error because the Edge Functions don't have access to QuickBooks OAuth credentials.

## Solution
Configure these 6 environment variables in Supabase Edge Functions:

###  Supabase Dashboard Method (Easiest)

1. **Go to**: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/functions

2. **Click "Add new secret"** and add each of these:

```
QB_CLIENT_ID=ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUOe0FPO

QB_CLIENT_SECRET=NEsyhDb1g5nficOBremLWqhqSyfwvOLlhkrSBLye

QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..cdhyjKCPBSEUwbs1w3vGHw.TObXcW0-jQiZ3yuiOkNzo6gG0I6ps3Eb88Gs5GJ3HfRxUnpNu0xf4sQBVTxguGXglBUf47JJt7eILd4D4bMF_kCcsoTIuz7T1rAMwL5aNyWh_V1SBYyORI5afpLjcp5ZtNNcb9ED7OT7od7-sY6L7BqZJL3RVxV-8TlzmP1j03pdRuNdpwEgRhABew2wBJzm4EL3aJz56oE028ReRahRaxF-C8SjRNBUYIVS1ZcJbUF047bg6mJ--5f9V68y4MDXpeWM9P21z7CANgw4C1iG3VKZ-813AXQ86Ayl9ccDWjwodauaxA2W3aC7alEiIBCg5LZU51x5o9i5Cgm4PcWPtqYb3UGHXtSK2TqRfVabdClk3VEh7xT-f-emycrMlswBa-yRGP-v1nEciZfsytimSAGticfom6xRtEu0_4nkkH4rNbIFFvFVJyZr64S8bXthcU6neuZ-bOczBVI5XMADxvPDSXIoHKiRnYrZcxEa-3FAhg5Kq4274mLCI_jOUKaQibyphdtT_t-PtIQkcW5qqRVv2MC1S2vdxvk35NMrJWQ12BbtLjrIDWcQVJfaUYxTXOzjnWocZ23GX1AFvb49YarGhajeDPDZxqNsY67MJRghBHBfGi0jVVlI78XuFEy_.Au-We7JEYj1iC-k6qQuXYg

QB_REFRESH_TOKEN=RT1-238-H0-1778466340r3t4uohd1588gyuavgbs

QB_REALM_ID=9341455753458595

QB_ENVIRONMENT=production
```

3. **Click "Save"** after adding each secret

4. **Restart Edge Functions** (they should restart automatically, but you can redeploy if needed)

## Verification

After configuring the secrets, test the sync:

1. Navigate to: http://localhost:3000/time-entries-enhanced
2. Click the "Sync from QuickBooks" button
3. Check for success message

Or run the Playwright test:
```bash
cd frontend
npx playwright test tests/qb-sync.spec.ts
```

## What These Secrets Do

- `QB_CLIENT_ID` & `QB_CLIENT_SECRET`: Your QuickBooks app credentials
- `QB_ACCESS_TOKEN`: Current OAuth access token (expires in 1 hour)
- `QB_REFRESH_TOKEN`: Used to get new access tokens (expires in 100 days)
- `QB_REALM_ID`: Your QuickBooks company ID
- `QB_ENVIRONMENT`: Set to `production` to use live QB data

## Troubleshooting

If sync still fails after configuration:
1. Check the Edge Function logs in Supabase Dashboard
2. Look for debug output (we added comprehensive logging)
3. Verify the tokens haven't expired
4. Check that `QB_ENVIRONMENT` matches your QB account type

## Security Note

These secrets are stored securely in Supabase and are only accessible to your Edge Functions. They are NOT exposed to the frontend application.
