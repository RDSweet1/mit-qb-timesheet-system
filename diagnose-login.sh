#!/bin/bash

echo "=== DIAGNOSING LOGIN ISSUE ==="
echo ""

echo "[1/5] Fetching production site..."
curl -s "https://rdsweet1.github.io/mit-qb-frontend/" > /tmp/index.html

echo "[2/5] Checking for Azure Client ID in HTML..."
if grep -q "973b689d-d96c-4445-883b-739fff12330b" /tmp/index.html; then
    echo "✓ Azure Client ID found in page source"
else
    echo "✗ Azure Client ID NOT found - config issue!"
fi

echo ""
echo "[3/5] Finding JavaScript bundles..."
LAYOUT_BUNDLE=$(grep -o "static/chunks/app/layout-[^\"]*\.js" /tmp/index.html | head -1)
echo "Layout bundle: $LAYOUT_BUNDLE"

if [ -n "$LAYOUT_BUNDLE" ]; then
    echo ""
    echo "[4/5] Checking bundle for MSAL config..."
    curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$LAYOUT_BUNDLE" > /tmp/bundle.js

    if grep -q "973b689d-d96c-4445-883b-739fff12330b" /tmp/bundle.js; then
        echo "✓ Client ID in bundle"
    fi

    if grep -q "localStorage" /tmp/bundle.js; then
        echo "✓ localStorage configured"
    fi

    if grep -q "Mail.Send" /tmp/bundle.js; then
        echo "✓ Mail permissions in bundle"
    fi

    # Extract the exact MSAL config
    echo ""
    echo "[5/5] Extracting MSAL configuration..."
    grep -o '{auth:{clientId:"[^"]*",authority:"[^"]*",redirectUri:"[^"]*"}' /tmp/bundle.js | head -1
fi

echo ""
echo "=== DIAGNOSIS COMPLETE ==="
echo ""
echo "Possible issues if button doesn't work:"
echo "1. Popup blocker in browser"
echo "2. JavaScript error (check browser console with F12)"
echo "3. MSAL library load failure"
echo "4. Azure Portal settings not propagated yet (wait 5 minutes)"
