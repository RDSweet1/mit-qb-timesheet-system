/**
 * ar-automation — Daily pg_cron job for AR collection sequence
 *
 * Runs daily at 9 AM. Checks invoice_log for invoices where
 * next_action_date <= today, fires the appropriate dunning stage.
 * Stage 5 (attorney) only queues an internal alert — does not auto-send.
 *
 * Schedule (add to pg_cron):
 *   SELECT cron.schedule('ar-automation', '0 9 * * *',
 *     $$SELECT net.http_post(url:='https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/ar-automation',
 *       headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb, body:='{}'::jsonb) AS request_id$$);
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date().toISOString().split('T')[0];
    console.log(`🤖 AR Automation running for ${today}`);

    // Sync inbox emails — capture customer replies before deciding on dunning
    const emailSyncRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ar-sync-emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lookbackDays: 3 }),
    });
    console.log(`Email sync: ${emailSyncRes.ok ? 'ok' : 'failed'}`);

    // Sync payments from QB so we don't send dunning letters to paid customers
    const syncRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ar-sync-payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    console.log(`Payment sync: ${syncRes.ok ? 'ok' : 'failed'}`);

    // Find invoices due for action today (not paid, not on promise-to-pay snooze)
    const { data: dueInvoices, error } = await supabase
      .from('invoice_log')
      .select('id, qb_invoice_id, qb_customer_id, customer_name, current_stage, next_action_date, ar_status, promise_to_pay_date, balance_due')
      .not('ar_status', 'in', '("paid","void","attorney")')
      .not('next_action_date', 'is', null)
      .lte('next_action_date', today);

    if (error) throw error;

    console.log(`📋 Found ${dueInvoices?.length || 0} invoices due for action`);

    let fired = 0;
    let skipped = 0;
    const internalAlerts: any[] = [];

    for (const inv of dueInvoices || []) {
      const nextStage = (inv.current_stage || 0) + 1;

      // Skip if customer promised to pay and that date hasn't passed yet
      if (inv.promise_to_pay_date && inv.promise_to_pay_date >= today) {
        console.log(`⏭️ Skipping ${inv.customer_name} — promise to pay by ${inv.promise_to_pay_date}`);
        skipped++;
        continue;
      }

      // Get config for next stage
      const { data: config } = await supabase
        .from('ar_sequence_config')
        .select('*')
        .eq('stage', nextStage)
        .single();

      if (!config) {
        console.log(`⚠️ No config for stage ${nextStage} — skipping ${inv.customer_name}`);
        skipped++;
        continue;
      }

      // Stage 5: internal alert only, no auto email
      if (!config.auto_fire || nextStage >= 5) {
        console.log(`🔴 INTERNAL ALERT: ${inv.customer_name} at Stage ${nextStage} — manual action required`);
        internalAlerts.push({
          invoice_log_id: inv.id,
          qb_invoice_id: inv.qb_invoice_id,
          qb_customer_id: inv.qb_customer_id,
          customer_name: inv.customer_name,
          stage: nextStage,
          balance_due: inv.balance_due,
        });

        // Log internal alert in activity log
        await supabase.from('ar_activity_log').insert({
          invoice_log_id: inv.id,
          qb_invoice_id: inv.qb_invoice_id,
          qb_customer_id: inv.qb_customer_id,
          activity_type: 'escalation',
          description: `Stage ${nextStage}: Internal alert generated — manual action required. Balance: $${parseFloat(inv.balance_due ?? '0').toFixed(2)}`,
          performed_by: 'system',
          metadata: { stage: nextStage, requires_manual: true, balance_due: inv.balance_due },
        });

        // Mark invoice as requiring attention (but don't change ar_status yet — Sharon decides)
        await supabase.from('invoice_log')
          .update({ current_stage: nextStage, next_action_date: null })
          .eq('id', inv.id);

        skipped++;
        continue;
      }

      // Auto-fire: call ar-send-collection
      try {
        const sendRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ar-send-collection`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ invoiceLogId: inv.id, stage: nextStage, sentBy: 'ar-automation' }),
        });

        if (sendRes.ok) {
          console.log(`✅ Stage ${nextStage} fired for ${inv.customer_name}`);
          fired++;
        } else {
          const err = await sendRes.text();
          console.error(`❌ Failed stage ${nextStage} for ${inv.customer_name}: ${err}`);
          skipped++;
        }
      } catch (e: any) {
        console.error(`❌ Exception for ${inv.customer_name}:`, e.message);
        skipped++;
      }
    }

    // Send internal summary email to Sharon + David if any alerts
    if (internalAlerts.length > 0) {
      await sendInternalAlertEmail(internalAlerts, supabase);
    }

    const summary = { date: today, processed: dueInvoices?.length || 0, fired, skipped, internalAlerts: internalAlerts.length };
    console.log('✅ AR Automation complete:', summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ AR Automation failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function sendInternalAlertEmail(alerts: any[], supabase: any) {
  try {
    const tenantId = Deno.env.get('AZURE_TENANT_ID');
    const clientId = Deno.env.get('AZURE_CLIENT_ID');
    const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    const { access_token } = await tokenRes.json();

    const rows = alerts.map(a =>
      `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;">${a.customer_name}</td>
       <td style="padding:10px;border-bottom:1px solid #e5e7eb;">Stage ${a.stage}</td>
       <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:700;">$${parseFloat(a.balance_due ?? '0').toFixed(2)}</td></tr>`
    ).join('');

    const html = `<h2 style="color:#dc2626;">⚠️ AR Collections — Manual Action Required</h2>
    <p>The following accounts require manual review today:</p>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;">
    <tr style="background:#f3f4f6;"><th style="padding:10px;text-align:left;">Customer</th><th style="padding:10px;text-align:left;">Stage</th><th style="padding:10px;text-align:left;">Balance Due</th></tr>
    ${rows}
    </table>
    <p style="margin-top:16px;">Log in to the <a href="https://rdsweet1.github.io/mit-qb-frontend/ar">AR Dashboard</a> to take action.</p>`;

    await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: `⚠️ AR Alert: ${alerts.length} Account(s) Require Manual Action`,
          body: { contentType: 'HTML', content: html },
          toRecipients: [
            { emailAddress: { address: 'skisner@mitigationconsulting.com' } },
            { emailAddress: { address: 'david@mitigationconsulting.com' } },
          ],
        },
        saveToSentItems: true,
      }),
    });
    console.log(`📧 Internal alert email sent for ${alerts.length} accounts`);
  } catch (e: any) {
    console.error('Failed to send internal alert email:', e.message);
  }
}
