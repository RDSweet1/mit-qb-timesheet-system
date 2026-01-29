// QuickBooks OAuth Launch URL
// This endpoint initiates the QuickBooks connection process
// Required by Intuit for production app approval

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Allow CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Get environment variables
    const clientId = Deno.env.get("QB_CLIENT_ID");
    const environment = Deno.env.get("QB_ENVIRONMENT") || "sandbox";

    if (!clientId) {
      throw new Error("QB_CLIENT_ID not configured");
    }

    // QuickBooks OAuth URLs
    const authUrls = {
      sandbox: "https://appcenter.intuit.com/connect/oauth2",
      production: "https://appcenter.intuit.com/connect/oauth2"
    };

    const authUrl = authUrls[environment as keyof typeof authUrls] || authUrls.sandbox;

    // Redirect URI (OAuth Playground for now, can be customized later)
    const redirectUri = "https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl";

    // Build OAuth authorization URL
    const scope = [
      "com.intuit.quickbooks.accounting"
    ].join(" ");

    // Generate state parameter for CSRF protection
    const state = crypto.randomUUID();

    const authorizationUrl = new URL(authUrl);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("scope", scope);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);

    // Return HTML page with connection button
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect to QuickBooks - MIT Consulting</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 50px;
            max-width: 600px;
            text-align: center;
        }
        .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: #2ca01c;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            color: white;
            font-weight: bold;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2em;
        }
        .company {
            color: #666;
            font-size: 1.1em;
            margin-bottom: 30px;
        }
        .description {
            color: #555;
            line-height: 1.6;
            margin-bottom: 30px;
            text-align: left;
        }
        .features {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: left;
        }
        .features h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.1em;
        }
        .features ul {
            list-style: none;
            padding: 0;
        }
        .features li {
            color: #555;
            margin-bottom: 10px;
            padding-left: 25px;
            position: relative;
        }
        .features li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #2ca01c;
            font-weight: bold;
            font-size: 1.2em;
        }
        .connect-button {
            display: inline-block;
            background: #2ca01c;
            color: white;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 8px;
            font-size: 1.1em;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(44,160,28,0.3);
        }
        .connect-button:hover {
            background: #248517;
            box-shadow: 0 6px 20px rgba(44,160,28,0.4);
            transform: translateY(-2px);
        }
        .info {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
            color: #888;
            font-size: 0.9em;
        }
        .environment-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 600;
            margin-bottom: 20px;
        }
        .env-production {
            background: #d4edda;
            color: #155724;
        }
        .env-sandbox {
            background: #fff3cd;
            color: #856404;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">QB</div>
        <h1>Connect to QuickBooks</h1>
        <div class="company">MIT Consulting Timesheet & Billing System</div>

        <div class="environment-badge ${environment === 'production' ? 'env-production' : 'env-sandbox'}">
            ${environment === 'production' ? '🟢 Production' : '🟡 Sandbox'} Environment
        </div>

        <div class="description">
            <p>Click the button below to securely connect your QuickBooks Online account to the MIT Consulting Timesheet & Billing System.</p>
        </div>

        <div class="features">
            <h3>What this connection enables:</h3>
            <ul>
                <li>Sync time entries from QuickBooks Workforce</li>
                <li>Sync customer and service item information</li>
                <li>Generate weekly time reports for clients</li>
                <li>Create monthly invoices in QuickBooks</li>
                <li>Track billing and payment status</li>
            </ul>
        </div>

        <a href="${authorizationUrl.toString()}" class="connect-button">
            Connect to QuickBooks Online
        </a>

        <div class="info">
            <p><strong>Secure OAuth 2.0 Authentication</strong></p>
            <p>Your QuickBooks credentials are never stored in our system.</p>
            <p>You can disconnect at any time from your QuickBooks account settings.</p>
        </div>

        <div class="info" style="margin-top: 20px;">
            <p><strong>Need help?</strong></p>
            <p>Email: accounting@mitigationconsulting.com</p>
            <p>Phone: 813-962-6855</p>
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

  } catch (error) {
    console.error("Error in connect-qb:", error);

    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            text-align: center;
        }
        .error-box {
            max-width: 600px;
            margin: 50px auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #d32f2f; }
        p { color: #555; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="error-box">
        <h1>⚠️ Configuration Error</h1>
        <p>The QuickBooks connection is not properly configured.</p>
        <p>Please contact your system administrator.</p>
        <p style="margin-top: 30px; font-size: 0.9em; color: #888;">
            Error: ${error instanceof Error ? error.message : 'Unknown error'}
        </p>
    </div>
</body>
</html>
    `;

    return new Response(errorHtml, {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
