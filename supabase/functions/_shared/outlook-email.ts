/**
 * Microsoft Outlook Email Sending via Graph API
 * Uses application permissions to send as any user/mailbox
 */

import { fetchWithRetry } from './fetch-retry.ts';

export interface OutlookConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string; // base64 encoded
}

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
}

/**
 * Get Microsoft Graph API access token
 */
export async function getGraphAccessToken(config: OutlookConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

  const response = await fetchWithRetry(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  }, { label: 'Graph Token', maxRetries: 3 });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Graph token: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Send email via Microsoft Graph API
 * Sends from specified mailbox (requires Mail.Send.Shared permission)
 */
export async function sendEmail(
  message: EmailMessage,
  config: OutlookConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get access token
    const accessToken = await getGraphAccessToken(config);

    // Extract email from "Name <email@domain.com>" format if needed
    const fromEmail = message.from.match(/<(.+)>$/)?.[1] || message.from;

    // Build Graph API message
    const graphMessage = {
      message: {
        subject: message.subject,
        body: {
          contentType: 'HTML',
          content: message.htmlBody
        },
        toRecipients: message.to.map(email => ({
          emailAddress: { address: email }
        })),
        ccRecipients: message.cc?.map(email => ({
          emailAddress: { address: email }
        })) || [],
        bccRecipients: message.bcc?.map(email => ({
          emailAddress: { address: email }
        })) || [],
        attachments: message.attachments?.map(att => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: att.name,
          contentType: att.contentType,
          contentBytes: att.contentBytes
        })) || []
      },
      saveToSentItems: true
    };

    // Send email using sendMail endpoint
    // This sends from the specified user's mailbox
    const response = await fetchWithRetry(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphMessage)
      },
      { label: 'Graph SendMail', maxRetries: 3 }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Graph API error:', error);
      return {
        success: false,
        error: `Failed to send email: ${response.status} - ${error}`
      };
    }

    // sendMail returns 202 with no body on success
    return {
      success: true,
      messageId: response.headers.get('request-id') || undefined
    };

  } catch (error) {
    console.error('Email sending error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get email sender configuration from Supabase
 */
export async function getDefaultEmailSender(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from('email_senders')
    .select('email')
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    // Fallback to hardcoded default
    return 'accounting@mitigationconsulting.com';
  }

  return data.email;
}
