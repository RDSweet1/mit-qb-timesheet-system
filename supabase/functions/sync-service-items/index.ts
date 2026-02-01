/**
 * Sync Service Items (Cost Codes) from QuickBooks
 * Fetches all active service items with their rates and stores in Supabase
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbQuery, getQBBaseUrl } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // QB configuration from environment
    const qbConfig = {
      clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
      environment: (Deno.env.get('QB_ENVIRONMENT') ?? 'sandbox') as 'sandbox' | 'production'
    };

    // Get tokens (in production, these would come from Key Vault)
    const tokens = {
      accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
      refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
      realmId: Deno.env.get('QB_REALM_ID') ?? ''
    };

    console.log('Syncing service items from QuickBooks...');

    // Query all active service items
    const query = `SELECT Id, Name, Description, UnitPrice, Active FROM Item WHERE Type = 'Service' AND Active = true`;

    const qbData = await qbQuery(query, tokens, qbConfig);

    const items = qbData.QueryResponse?.Item || [];

    console.log(`Found ${items.length} service items`);

    // Upsert each item
    let syncedCount = 0;
    const errors = [];

    for (const item of items) {
      // Generate a short code from the name
      // e.g., "Expert Witness - Deposition" -> "EXPERT-DEPO"
      const code = item.Name
        .toUpperCase()
        .replace(/[^A-Z0-9\s-]/g, '')
        .split(/\s+/)
        .slice(0, 2) // Take first 2 words
        .join('-');

      const { error } = await supabaseClient
        .from('service_items')
        .upsert({
          qb_item_id: item.Id,
          name: item.Name,
          code: code,
          description: item.Description || null,
          unit_price: parseFloat(item.UnitPrice) || 0,
          is_active: item.Active === 'true' || item.Active === true,
          synced_at: new Date().toISOString()
        }, {
          onConflict: 'qb_item_id'
        });

      if (error) {
        console.error(`Error syncing item ${item.Id}:`, error);
        errors.push({ itemId: item.Id, itemName: item.Name, error: error.message, details: error });
      } else {
        syncedCount++;
      }
    }

    console.log(`Successfully synced ${syncedCount}/${items.length} items`);
    if (errors.length > 0) {
      console.error(`Failed to sync ${errors.length} items:`, errors.slice(0, 3));
    }

    return new Response(
      JSON.stringify({
        success: syncedCount > 0,
        synced: syncedCount,
        total: items.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        items: items.slice(0, 10).map(i => ({
          id: i.Id,
          name: i.Name,
          rate: parseFloat(i.UnitPrice) || 0
        }))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error syncing service items:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
