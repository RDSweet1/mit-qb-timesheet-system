// QuickBooks Disconnect URL
// This endpoint handles disconnection from QuickBooks
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
    // Parse query parameters (Intuit may pass realmId and other params)
    const url = new URL(req.url);
    const realmId = url.searchParams.get("realmId");
    const disconnected = url.searchParams.get("disconnected");

    console.log("QuickBooks disconnect request received", {
      realmId,
      disconnected,
      timestamp: new Date().toISOString()
    });

    // Return confirmation page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Disconnected from QuickBooks - MIT Consulting</title>
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
        .icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: #ff6b6b;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
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
        .message {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 30px;
            text-align: left;
        }
        .message h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.1em;
        }
        .message p {
            color: #555;
            line-height: 1.6;
            margin-bottom: 10px;
        }
        .info-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin-bottom: 20px;
            text-align: left;
        }
        .info-box p {
            color: #856404;
            margin: 0;
            font-size: 0.95em;
        }
        .reconnect-button {
            display: inline-block;
            background: #2ca01c;
            color: white;
            text-decoration: none;
            padding: 14px 35px;
            border-radius: 8px;
            font-size: 1em;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(44,160,28,0.3);
            margin-top: 10px;
        }
        .reconnect-button:hover {
            background: #248517;
            box-shadow: 0 6px 20px rgba(44,160,28,0.4);
            transform: translateY(-2px);
        }
        .contact-info {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
            color: #888;
            font-size: 0.9em;
        }
        ul {
            text-align: left;
            color: #555;
            line-height: 1.8;
            margin-left: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔌</div>
        <h1>Disconnected from QuickBooks</h1>
        <div class="company">MIT Consulting Timesheet & Billing System</div>

        <div class="message">
            <h3>✓ QuickBooks connection has been removed</h3>
            <p>Your QuickBooks Online account has been successfully disconnected from the MIT Consulting Timesheet & Billing System.</p>
        </div>

        <div class="info-box">
            <p><strong>⚠️ Important:</strong> Disconnecting will prevent the following features from working:</p>
        </div>

        <ul>
            <li>Automatic time entry synchronization</li>
            <li>Weekly client reports</li>
            <li>Monthly invoice creation</li>
            <li>Customer and service item updates</li>
        </ul>

        <div class="message" style="margin-top: 30px;">
            <h3>What happens next?</h3>
            <p><strong>Your data is safe:</strong> No data from your QuickBooks account is deleted. We only lose access to read and write to your account.</p>
            <p><strong>Reconnect anytime:</strong> You can reconnect at any time by clicking the button below.</p>
        </div>

        <a href="../connect-qb" class="reconnect-button">
            Reconnect to QuickBooks
        </a>

        <div class="contact-info">
            <p><strong>Need assistance?</strong></p>
            <p>Email: accounting@mitigationconsulting.com</p>
            <p>Phone: 813-962-6855</p>
            <p>Accounting: 717-377-6447</p>
        </div>

        ${realmId ? `
        <div class="contact-info" style="font-size: 0.8em; color: #aaa; margin-top: 20px;">
            <p>Realm ID: ${realmId}</p>
            <p>Disconnected at: ${new Date().toLocaleString()}</p>
        </div>
        ` : ''}
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
    console.error("Error in disconnect-qb:", error);

    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - MIT Consulting</title>
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
        h1 { color: #d32f2f; margin-bottom: 20px; }
        p { color: #555; line-height: 1.6; }
        .back-button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="error-box">
        <h1>⚠️ An Error Occurred</h1>
        <p>We encountered an issue processing your disconnect request.</p>
        <p>Your QuickBooks connection may still be active.</p>
        <p style="margin-top: 30px; font-size: 0.9em; color: #888;">
            Error: ${error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <a href="../connect-qb" class="back-button">Back to Connection Page</a>
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
