#!/bin/bash
# Quick test script to verify QuickBooks OAuth connection
# 
# Usage: 
#   1. Edit this file and paste your values below
#   2. Run: bash test-qb-curl.sh

# ============================================
# PASTE YOUR VALUES HERE
# ============================================
ACCESS_TOKEN="eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..u1Od1R6cREphLWBF_Q01Pw.DjmKZQl-VMMRQzJzAWWwQ47EcteZv3m1EbSPSzNm0_7ND3717wFg6NFpVp5iNcVOS49yhNzUbBJpjczfyDVX-5ls33MIeAXjiSFQeKQ"
REALM_ID="9341456256329564"
ENVIRONMENT="sandbox"  # or "production"
# ============================================

if [ "$ENVIRONMENT" = "production" ]; then
  BASE_URL="https://quickbooks.api.intuit.com"
else
  BASE_URL="https://sandbox-quickbooks.api.intuit.com"
fi

echo "🔗 Testing QuickBooks API Connection..."
echo ""
echo "Environment: $ENVIRONMENT"
echo "Realm ID: $REALM_ID"
echo "Base URL: $BASE_URL"
echo ""

echo "📋 Fetching Company Info..."
echo ""

curl -s -X GET \
  "${BASE_URL}/v3/company/${REALM_ID}/companyinfo/${REALM_ID}?minorversion=75" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Accept: application/json" | python3 -m json.tool 2>/dev/null || echo "❌ Failed - token may be expired"

echo ""
echo "📋 Fetching Service Items (Cost Codes)..."
echo ""

curl -s -X POST \
  "${BASE_URL}/v3/company/${REALM_ID}/query?minorversion=75" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/text" \
  -H "Accept: application/json" \
  -d "SELECT Id, Name, UnitPrice FROM Item WHERE Type = 'Service' AND Active = true" | python3 -m json.tool 2>/dev/null || echo "❌ Failed"

echo ""
echo "Done!"
