#!/bin/bash
# GitHub Secrets Setup Script

echo "Setting up GitHub secrets for production deployment..."

# Supabase credentials (already known)
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "https://migcpasmtbdojqphqyzc.supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

# Redirect URI
gh secret set NEXT_PUBLIC_REDIRECT_URI --body "https://rdsweet1.github.io/mit-qb-frontend"

# Azure credentials (empty for now, add when you have them)
gh secret set NEXT_PUBLIC_AZURE_CLIENT_ID --body ""
gh secret set NEXT_PUBLIC_AZURE_TENANT_ID --body ""

echo "✓ GitHub secrets configured!"
echo ""
echo "To update Azure credentials later, run:"
echo "  gh secret set NEXT_PUBLIC_AZURE_CLIENT_ID --body 'your-client-id'"
echo "  gh secret set NEXT_PUBLIC_AZURE_TENANT_ID --body 'your-tenant-id'"
