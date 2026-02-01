# Deploy billableOnly Fix
# This script deploys both the Edge Function and Frontend changes

Write-Host ""
Write-Host "Deploying billableOnly fix..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Deploy Edge Function
Write-Host "[1/3] Deploying Edge Function to Supabase..." -ForegroundColor Yellow
cd supabase/functions
npx supabase functions deploy qb-time-sync --project-ref migcpasmtbdojqphqyzc

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Edge Function deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "  Edge Function deploy failed. Trying alternative method..." -ForegroundColor Yellow

    # Alternative: Deploy all functions
    cd ../..
    npx supabase functions deploy --project-ref migcpasmtbdojqphqyzc
}

# Step 2: Build Frontend
Write-Host ""
Write-Host "[2/3] Building Frontend..." -ForegroundColor Yellow
cd ../../frontend
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "  Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "  Frontend built successfully!" -ForegroundColor Green

# Step 3: Deploy Frontend to GitHub Pages
Write-Host ""
Write-Host "[3/3] Deploying Frontend to GitHub Pages..." -ForegroundColor Yellow

# Commit changes
cd ..
git add frontend/app/time-entries-enhanced/page.tsx
git add supabase/functions/qb-time-sync/index.ts
git commit -m "Fix: Set billableOnly=false to sync all time entries

- Frontend now explicitly passes billableOnly: false
- Edge Function defaults to billableOnly: false
- This allows syncing all time entries regardless of billable status

Previously, only entries with BillableStatus='Billable' were synced,
which excluded NotBillable and HasBeenBilled entries.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to trigger GitHub Actions deployment
git push origin master

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Changes deployed:" -ForegroundColor Cyan
Write-Host "  - Edge Function: Defaults to billableOnly=false" -ForegroundColor Gray
Write-Host "  - Frontend: Explicitly passes billableOnly=false" -ForegroundColor Gray
Write-Host ""
Write-Host "Testing:" -ForegroundColor Cyan
Write-Host "  - Wait 2-3 minutes for GitHub Pages deployment" -ForegroundColor Gray
Write-Host "  - Visit: https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Gray
Write-Host "  - Go to Time Entries page" -ForegroundColor Gray
Write-Host "  - Click 'Sync from QB' with December 2025 - January 2026" -ForegroundColor Gray
Write-Host "  - Should see ~90+ time entries!" -ForegroundColor Gray
Write-Host ""
