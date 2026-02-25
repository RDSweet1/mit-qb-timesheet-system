/**
 * Manage QB Accounts Edge Function
 *
 * List Bank/Credit Card accounts and create new Credit Card accounts in QuickBooks Online.
 * Uses action-based dispatch pattern (same as manage_users).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { loadQBTokens, qbQuery, qbCreate } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManageAccountsRequest {
  action: 'list' | 'create';
  name?: string;
  description?: string;
  acctNum?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🏦 Manage QB Accounts: Starting...');

    const body: ManageAccountsRequest = await req.json();
    const { action } = body;

    if (!action) {
      throw new Error('Missing required field: action');
    }

    console.log(`📋 Action: ${action}`);

    const { tokens, config } = await loadQBTokens();

    switch (action) {
      case 'list': {
        const result = await qbQuery(
          "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance, Active, AcctNum FROM Account MAXRESULTS 200",
          tokens,
          config
        );

        const allAccounts = result.QueryResponse?.Account || [];

        // Filter to Bank and Credit Card accounts only
        const accounts = allAccounts
          .filter((a: any) => a.AccountType === 'Bank' || a.AccountType === 'Credit Card')
          .map((a: any) => ({
            id: a.Id,
            name: a.Name,
            accountType: a.AccountType,
            accountSubType: a.AccountSubType,
            currentBalance: a.CurrentBalance,
            active: a.Active,
            acctNum: a.AcctNum || null,
          }));

        console.log(`✅ Found ${accounts.length} Bank/Credit Card accounts`);

        return new Response(
          JSON.stringify({ success: true, accounts }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'create': {
        if (!body.name) {
          throw new Error('Missing required field: name');
        }

        const accountData: Record<string, string> = {
          Name: body.name,
          AccountType: 'Credit Card',
          AccountSubType: 'CreditCard',
        };

        if (body.description) {
          accountData.Description = body.description;
        }
        if (body.acctNum) {
          accountData.AcctNum = body.acctNum;
        }

        console.log(`🆕 Creating Credit Card account: ${body.name}`);

        const result = await qbCreate('account', accountData, tokens, config);
        const created = result.Account;

        console.log(`✅ Account created: ${created.Name} (ID: ${created.Id})`);

        return new Response(
          JSON.stringify({
            success: true,
            account: {
              id: created.Id,
              name: created.Name,
              accountType: created.AccountType,
              accountSubType: created.AccountSubType,
              currentBalance: created.CurrentBalance,
              active: created.Active,
              acctNum: created.AcctNum || null,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('❌ Manage QB Accounts failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
