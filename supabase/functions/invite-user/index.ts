/**
 * Invite User Edge Function
 * Sends a welcome/onboarding email to a user with:
 * - Personalized app link (login_hint pre-fills their email at sign-in)
 * - Attached .url desktop shortcut file (drag to desktop for quick access)
 * - Getting started guide
 *
 * Input: { email, display_name, admin_email }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://rdsweet1.github.io/mit-qb-frontend/';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, display_name, admin_email } = await req.json();

    if (!email || !display_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: email, display_name' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };

    const personalizedUrl = `${APP_URL}?login_hint=${encodeURIComponent(email)}`;
    const fromEmail = await getDefaultEmailSender(supabase);
    const firstName = display_name.split(' ')[0];

    const htmlBody = generateInviteEmail(firstName, email, personalizedUrl);

    const emailResult = await sendEmail(
      {
        from: fromEmail,
        to: [email],
        cc: admin_email ? [admin_email] : [],
        subject: 'Welcome to MIT Consulting Timesheet System',
        htmlBody
      },
      outlookConfig
    );

    // Update app_users to record invite sent
    await supabase
      .from('app_users')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('email', email);

    return new Response(
      JSON.stringify({
        success: emailResult.success,
        email,
        personalizedUrl,
        error: emailResult.error || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Invite error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Generate welcome/onboarding HTML email
 * Uses 100% inline styles — Outlook desktop strips <style> blocks
 */
function generateInviteEmail(
  firstName: string,
  email: string,
  personalizedUrl: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 30px 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: bold; color: #ffffff;">Welcome to MIT Timesheet</h1>
              <p style="margin: 0; font-size: 14px; color: #dbeafe;">Mitigation Inspection &amp; Testing</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 30px 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">

              <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${firstName},</p>

              <p style="font-size: 14px; margin: 0 0 16px 0;">You've been set up with access to the <strong>MIT Consulting Timesheet System</strong>. This app lets you view time entries, weekly reports, and billing information.</p>

              <!-- Big CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${personalizedUrl}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Open MIT Timesheet</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${personalizedUrl}" style="display: inline-block; padding: 14px 40px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; font-family: Arial, sans-serif;">Open MIT Timesheet</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p style="text-align: center; font-size: 13px; color: #6b7280; margin: 0 0 8px 0;">
                Your sign-in email: <strong>${email}</strong>
              </p>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;">

              <!-- Getting Started -->
              <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 16px;">Getting Started</h3>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" valign="top" style="padding: 0 12px 16px 0;">
                    <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; font-size: 14px;">1</div>
                  </td>
                  <td valign="top" style="padding: 3px 0 16px 0; font-size: 14px; color: #374151;">
                    <strong>Click the button above</strong> to open the app. Your email will be pre-filled at the Microsoft sign-in screen — just enter your password.
                  </td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding: 0 12px 16px 0;">
                    <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; font-size: 14px;">2</div>
                  </td>
                  <td valign="top" style="padding: 3px 0 16px 0; font-size: 14px; color: #374151;">
                    <strong>Save a desktop shortcut.</strong> On the sign-in page, click <strong>"Save Desktop Shortcut"</strong> to download an icon for your Desktop — double-click it anytime to open the app.
                  </td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding: 0 12px 16px 0;">
                    <div style="background-color: #2563eb; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; font-size: 14px;">3</div>
                  </td>
                  <td valign="top" style="padding: 3px 0 16px 0; font-size: 14px; color: #374151;">
                    <strong>Stay signed in.</strong> After your first login, you'll stay signed in automatically. Future visits are instant — no password needed.
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

              <!-- Desktop Shortcut Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 15px;">Add to Your Desktop</h3>
                    <p style="font-size: 13px; color: #1e40af; margin: 0 0 8px 0;">
                      Want a desktop icon for quick access? Two easy options:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #374151;">
                      <tr><td style="padding: 6px 0;"><strong>Option A:</strong> Click the button above, then on the sign-in page click <strong>"Save Desktop Shortcut"</strong> — it downloads an icon you can keep on your Desktop.</td></tr>
                      <tr><td style="padding: 6px 0;"><strong>Option B:</strong> Open the app in Chrome or Edge, click the <strong>three-dot menu</strong> (top right), select <strong>"More tools"</strong> &gt; <strong>"Create shortcut"</strong>, and check <strong>"Open as window"</strong> for an app-like experience.</td></tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280;">
              <p style="margin: 0;">Questions? Reply to this email or contact <a href="mailto:accounting@mitigationconsulting.com" style="color: #2563eb;">accounting@mitigationconsulting.com</a></p>
              <p style="margin: 8px 0 0 0;"><strong>MIT Consulting</strong> | Mitigation Inspection &amp; Testing</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
