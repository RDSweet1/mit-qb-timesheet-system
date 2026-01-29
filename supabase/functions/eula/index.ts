// EULA and Privacy Policy Page for QuickBooks Production App Approval
// This page is required by Intuit for production API access

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Allow CORS for all origins
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MIT Consulting - QuickBooks Timesheet System EULA</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1a73e8;
            margin-bottom: 10px;
            font-size: 2em;
        }
        h2 {
            color: #1a73e8;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 1.5em;
            border-bottom: 2px solid #e8f0fe;
            padding-bottom: 10px;
        }
        h3 {
            color: #444;
            margin-top: 20px;
            margin-bottom: 10px;
            font-size: 1.2em;
        }
        p, li {
            margin-bottom: 12px;
            color: #555;
        }
        ul {
            margin-left: 30px;
            margin-bottom: 15px;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #1a73e8;
        }
        .company {
            color: #666;
            font-size: 1.1em;
            margin-top: 5px;
        }
        .date {
            color: #888;
            font-size: 0.9em;
            font-style: italic;
        }
        .highlight {
            background: #e8f0fe;
            padding: 15px;
            border-left: 4px solid #1a73e8;
            margin: 20px 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
            text-align: center;
            color: #888;
            font-size: 0.9em;
        }
        strong {
            color: #1a73e8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>End User License Agreement</h1>
            <div class="company">MIT Consulting - QuickBooks Timesheet & Billing System</div>
            <div class="date">Effective Date: January 29, 2026</div>
        </div>

        <div class="highlight">
            <p><strong>Internal Use Application:</strong> This application is exclusively for internal use by Mitigation Information Technologies (MIT Consulting) employees and authorized personnel. This is not a public-facing application.</p>
        </div>

        <h2>1. Agreement Overview</h2>
        <p>This End User License Agreement ("Agreement") governs your use of the MIT Consulting QuickBooks Timesheet & Billing System ("Application"). By using this Application, you agree to these terms.</p>

        <h2>2. License Grant</h2>
        <p>MIT Consulting grants authorized employees a limited, non-exclusive, non-transferable license to use this Application for business purposes related to timesheet management and client billing.</p>

        <h3>2.1 Authorized Users</h3>
        <ul>
            <li>Current MIT Consulting employees with assigned roles</li>
            <li>Authorized contractors as designated by management</li>
            <li>Access is controlled via Microsoft Entra ID (Azure AD) authentication</li>
        </ul>

        <h2>3. Application Purpose</h2>
        <p>The Application provides the following functionality:</p>
        <ul>
            <li><strong>Time Entry Synchronization:</strong> Syncs time entries from QuickBooks Online</li>
            <li><strong>Weekly Reports:</strong> Generates and emails weekly time summaries to clients</li>
            <li><strong>Invoice Creation:</strong> Creates monthly invoices in QuickBooks Online</li>
            <li><strong>Service Item Management:</strong> Syncs cost codes and billing rates</li>
        </ul>

        <h2>4. Data Access and Usage</h2>

        <h3>4.1 QuickBooks Data</h3>
        <p>The Application accesses the following data from QuickBooks Online:</p>
        <ul>
            <li>Time entries (TimeActivity records)</li>
            <li>Customer information</li>
            <li>Service items and billing rates</li>
            <li>Employee names</li>
            <li>Invoice data</li>
        </ul>

        <h3>4.2 Data Storage</h3>
        <p>Data is stored securely in a Supabase (PostgreSQL) database hosted in AWS US-East-1 (Virginia) with the following protections:</p>
        <ul>
            <li>Row-level security policies</li>
            <li>Encrypted at rest and in transit (TLS 1.3)</li>
            <li>Access controlled via service role keys</li>
            <li>Regular automated backups</li>
        </ul>

        <h3>4.3 Data Privacy</h3>
        <p><strong>MIT Consulting commits to:</strong></p>
        <ul>
            <li>Never share customer data with third parties</li>
            <li>Never sell or disclose client information</li>
            <li>Use data exclusively for internal billing and reporting</li>
            <li>Maintain strict confidentiality of all business information</li>
        </ul>

        <h2>5. User Responsibilities</h2>

        <h3>5.1 Account Security</h3>
        <ul>
            <li>Maintain confidentiality of login credentials</li>
            <li>Use multi-factor authentication (MFA) when required</li>
            <li>Report unauthorized access immediately</li>
            <li>Do not share access credentials with unauthorized persons</li>
        </ul>

        <h3>5.2 Proper Use</h3>
        <ul>
            <li>Use the Application only for legitimate business purposes</li>
            <li>Do not attempt to access unauthorized data</li>
            <li>Do not modify, reverse engineer, or circumvent security measures</li>
            <li>Report bugs or security vulnerabilities to IT management</li>
        </ul>

        <h2>6. Security Measures</h2>

        <h3>6.1 Authentication</h3>
        <ul>
            <li><strong>Frontend Access:</strong> Microsoft Entra ID (Azure AD) Single Sign-On</li>
            <li><strong>QuickBooks OAuth:</strong> Intuit OAuth 2.0 with automatic token refresh</li>
            <li><strong>API Security:</strong> Service role keys stored in Supabase Secrets Manager</li>
        </ul>

        <h3>6.2 Infrastructure</h3>
        <ul>
            <li>Hosted on Supabase Cloud (AWS infrastructure)</li>
            <li>HTTPS/TLS encryption for all communications</li>
            <li>No credentials stored in source code or browser logs</li>
            <li>Regular security updates and patches</li>
        </ul>

        <h2>7. Integration with Third-Party Services</h2>

        <p>This Application integrates with:</p>
        <ul>
            <li><strong>QuickBooks Online:</strong> For timesheet and invoice data (Intuit Inc.)</li>
            <li><strong>Microsoft Graph API:</strong> For sending email reports via Outlook (Microsoft Corporation)</li>
            <li><strong>Supabase:</strong> For database and cloud functions (Supabase Inc.)</li>
        </ul>

        <p>Use of these services is subject to their respective terms of service and privacy policies.</p>

        <h2>8. Limitation of Liability</h2>

        <p>This Application is provided "as is" for internal business use. MIT Consulting makes reasonable efforts to ensure accuracy and reliability but does not guarantee:</p>
        <ul>
            <li>Uninterrupted service availability</li>
            <li>Error-free operation</li>
            <li>Compatibility with all systems or devices</li>
        </ul>

        <h2>9. Termination</h2>

        <p>Access to this Application terminates automatically when:</p>
        <ul>
            <li>Employment with MIT Consulting ends</li>
            <li>User violates this Agreement</li>
            <li>Management revokes access for any reason</li>
        </ul>

        <h2>10. Privacy Policy</h2>

        <h3>10.1 Information Collection</h3>
        <p>The Application collects:</p>
        <ul>
            <li>User identity information (from Azure AD)</li>
            <li>QuickBooks business data (customers, time entries, invoices)</li>
            <li>Application usage logs (for troubleshooting)</li>
        </ul>

        <h3>10.2 Information Use</h3>
        <p>Collected information is used solely to:</p>
        <ul>
            <li>Generate weekly time reports for clients</li>
            <li>Create monthly invoices in QuickBooks</li>
            <li>Provide access control and authentication</li>
            <li>Troubleshoot technical issues</li>
        </ul>

        <h3>10.3 Information Sharing</h3>
        <p><strong>We do NOT:</strong></p>
        <ul>
            <li>Sell or rent customer data</li>
            <li>Share data with third parties for marketing</li>
            <li>Disclose confidential business information</li>
            <li>Use data for any purpose outside MIT Consulting operations</li>
        </ul>

        <h3>10.4 Data Retention</h3>
        <ul>
            <li>Time entry data: Retained for 7 years (accounting requirements)</li>
            <li>Invoice logs: Retained for 7 years (accounting requirements)</li>
            <li>Email logs: Retained for 1 year</li>
            <li>Application logs: Retained for 90 days</li>
        </ul>

        <h2>11. Compliance</h2>

        <p>This Application complies with:</p>
        <ul>
            <li>Intuit Developer Platform Requirements</li>
            <li>QuickBooks Online API Terms of Service</li>
            <li>Microsoft Graph API Terms</li>
            <li>Generally Accepted Accounting Principles (GAAP)</li>
        </ul>

        <h2>12. Changes to This Agreement</h2>

        <p>MIT Consulting reserves the right to modify this Agreement at any time. Users will be notified of significant changes via email or system notification.</p>

        <h2>13. Contact Information</h2>

        <p>For questions, concerns, or support regarding this Application:</p>
        <ul>
            <li><strong>Email:</strong> accounting@mitigationconsulting.com</li>
            <li><strong>Phone:</strong> 813-962-6855</li>
            <li><strong>Accounting:</strong> 717-377-6447</li>
        </ul>

        <div class="footer">
            <p><strong>Mitigation Information Technologies (MIT Consulting)</strong></p>
            <p>EIN: 47-2099595</p>
            <p>&copy; 2026 MIT Consulting. All rights reserved.</p>
            <p style="margin-top: 15px; font-size: 0.85em;">
                This is an internal business application. Not for public distribution.
            </p>
        </div>
    </div>
</body>
</html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
