#!/bin/bash
# Automated deployment script
# This script attempts to deploy functions but requires manual Supabase login token

set -e

echo "🚀 Automated Supabase Deployment"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in project directory"
    exit 1
fi

echo "📦 Installing Supabase CLI..."
npm install -g supabase

echo ""
echo "⚠️  AUTHENTICATION REQUIRED"
echo ""
echo "To proceed, I need a Supabase access token."
echo "Get it from: https://supabase.com/dashboard/account/tokens"
echo ""
echo "Once you have it, set it as an environment variable:"
echo "export SUPABASE_ACCESS_TOKEN=your_token_here"
echo ""

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN not set. Cannot proceed."
    echo ""
    echo "Manual steps required:"
    echo "1. Go to https://supabase.com/dashboard/account/tokens"
    echo "2. Generate new token"
    echo "3. Run: export SUPABASE_ACCESS_TOKEN=your_token"
    echo "4. Re-run this script"
    exit 1
fi

echo "✅ Access token found"
echo ""

# Login using token
echo "🔐 Logging into Supabase..."
echo "$SUPABASE_ACCESS_TOKEN" | supabase login

# Link project
echo "🔗 Linking to project..."
supabase link --project-ref wppuhwrehjpsxjxqwsnr

# Deploy functions
echo "📤 Deploying Edge Functions..."
echo ""

echo "Deploying sync-service-items..."
supabase functions deploy sync-service-items

echo "Deploying qb-time-sync..."
supabase functions deploy qb-time-sync

echo "Deploying send-reminder..."
supabase functions deploy send-reminder

echo "Deploying create-invoices..."
supabase functions deploy create-invoices

# Set secrets
echo ""
echo "🔑 Setting environment secrets..."

supabase secrets set QB_CLIENT_ID=ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a
supabase secrets set QB_CLIENT_SECRET=O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU
supabase secrets set QB_REALM_ID=9341456256329564
supabase secrets set QB_ENVIRONMENT=sandbox
supabase secrets set AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb
supabase secrets set AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b
supabase secrets set AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET_HERE
supabase secrets set QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..ImuEB5Zem2v7mQWmDi0L7g.DoT62xGqG8S7VQqVaZGBEK_kfrQpXDPxs_RUQa2-1P922z-H8PKEdS2sgxM34T4gINMZVSStmqpJBFC91hCkHXAtj1jVDhPQaV96CayA04PzCx7FzhLprBmPMo9HMOp8nLGcjoxiBfjTsASL9mpgCs3r_3JDVPL8UtuJqGBnvgQPIwS4VrOY7i-Lk0TDTiele4R2w9Le8Fl4Y9qQqZckrRkkHg6hT1UmDzqU1GX2lU8BwT8S-sItscveJDKhCtHR-2qEuVUN9LwpYWqVXde8LxEgQTiKl6WuOylbv1I56C8r9Vin9iaSOw8EJ5tm4TBiMA9xJ4kIKPdLeY_AyqkAS24fr3FIcHewzLBnjLw1w_n101c5mAVWt-efm0ktfqNsC-1TvF_3jDWlPhrJJm1nqkOQb61DFDLJDAlYpg4tuBEhjYAyCwiAmG-PTiqLz57HdNDtoSlb0wo9Hxc65ns2zJ8MLf02ULs5xQMyBODy5q_OYMAa4QO45DAASMxLLwVRdzS-28nj5s3qRwcFy3740-MDILVrExlv9FF3uA_-8AH_Qy7wwC9DJOrzyOCFCC0_lKr_qCvMmNPeNdD7Aj1h7Ib6HPBnt-5-7z6UGFhWHAeCc1ESM0mX5efYmL-HT7b6.a9Bd4B1oB4fStEkazhZ6-Q
supabase secrets set QB_REFRESH_TOKEN=RT1-222-IIb-17784204R0vt2sAmsl8ncvdklSa3zw

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Testing functions..."
supabase functions list

echo ""
echo "🎉 All done!"
