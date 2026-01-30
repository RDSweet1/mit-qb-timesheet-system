#!/bin/bash

# Script to verify the production deployment has correct configuration

echo "============================================"
echo "Production Deployment Verification"
echo "============================================"
echo ""

echo "[1/5] Checking if site is accessible..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://rdsweet1.github.io/mit-qb-frontend/")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Site is online (HTTP $HTTP_CODE)"
else
    echo "❌ Site returned HTTP $HTTP_CODE"
    exit 1
fi
echo ""

echo "[2/5] Checking for login button in HTML..."
if curl -s "https://rdsweet1.github.io/mit-qb-frontend/" | grep -q "Sign in with Microsoft"; then
    echo "✅ Login button found in page"
else
    echo "❌ Login button not found"
fi
echo ""

echo "[3/5] Checking Azure credentials in JavaScript bundles..."
LAYOUT_BUNDLE=$(curl -s "https://rdsweet1.github.io/mit-qb-frontend/" | grep -o "static/chunks/app/layout-[^\"]*\.js" | head -1)

if [ -n "$LAYOUT_BUNDLE" ]; then
    echo "   Found layout bundle: $LAYOUT_BUNDLE"

    CLIENT_ID=$(curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$LAYOUT_BUNDLE" | grep -o "973b689d-d96c-4445-883b-739fff12330b")
    if [ -n "$CLIENT_ID" ]; then
        echo "✅ Azure Client ID found in deployed code"
    else
        echo "❌ Azure Client ID NOT found in deployed code"
    fi

    TENANT_ID=$(curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$LAYOUT_BUNDLE" | grep -o "aee0257d-3be3-45ae-806b-65c972c98dfb")
    if [ -n "$TENANT_ID" ]; then
        echo "✅ Azure Tenant ID found in deployed code"
    else
        echo "❌ Azure Tenant ID NOT found in deployed code"
    fi

    LOCALSTORAGE=$(curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$LAYOUT_BUNDLE" | grep -o "localStorage")
    if [ -n "$LOCALSTORAGE" ]; then
        echo "✅ localStorage configuration found (persistent login enabled)"
    else
        echo "❌ localStorage not configured"
    fi
else
    echo "❌ Could not find layout bundle"
fi
echo ""

echo "[4/5] Checking Supabase configuration..."
SUPABASE_URL=$(curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$LAYOUT_BUNDLE" | grep -o "https://migcpasmtbdojqphqyzc.supabase.co")
if [ -n "$SUPABASE_URL" ]; then
    echo "✅ Supabase URL configured"
else
    echo "⚠️  Supabase URL not found (might be in different bundle)"
fi
echo ""

echo "[5/5] Checking recent deployment..."
echo "   GitHub Actions Status:"
cd frontend 2>/dev/null && gh run list --limit 1 || echo "   (gh CLI not available)"
echo ""

echo "============================================"
echo "Summary:"
echo "============================================"
echo ""
echo "Production URL: https://rdsweet1.github.io/mit-qb-frontend/"
echo ""
echo "Next step: Configure Azure Portal redirect URI"
echo "See: TEST-LOGIN-MANUAL.md for instructions"
echo ""
echo "Test the login:"
echo "1. Open https://rdsweet1.github.io/mit-qb-frontend/"
echo "2. Click 'Sign in with Microsoft'"
echo "3. If you get AADSTS50011 error, the redirect URI needs to be added in Azure Portal"
echo ""
