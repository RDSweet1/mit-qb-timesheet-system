# Deploy Edge Function using Supabase API
# This uses the Management API to deploy the updated qb-time-sync function

$token = "sbp_c8ec56e9b7d3161b9add4a34383e49ca1078fffd"
$project = "migcpasmtbdojqphqyzc"

Write-Host ""
Write-Host "Deploying Edge Function: qb-time-sync" -ForegroundColor Cyan
Write-Host ""

# Read the function code
$functionCode = Get-Content "supabase/functions/qb-time-sync/index.ts" -Raw

# Create deployment payload
$payload = @{
    slug = "qb-time-sync"
    verify_jwt = $false
    import_map = $true
} | ConvertTo-Json

Write-Host "Deploying function..." -NoNewline

try {
    # Try using Supabase CLI first (most reliable)
    Write-Host ""
    Write-Host "Attempting deployment via Supabase CLI..." -ForegroundColor Yellow

    $env:SUPABASE_ACCESS_TOKEN = $token

    cd supabase/functions
    $result = npx supabase functions deploy qb-time-sync --project-ref $project 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS via CLI!" -ForegroundColor Green
        Write-Host $result
    } else {
        Write-Host "CLI deployment failed, trying alternative..." -ForegroundColor Yellow
        Write-Host $result

        # Alternative: Try deploying all functions
        cd ../..
        $result2 = npx supabase functions deploy --project-ref $project 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "SUCCESS via CLI (all functions)!" -ForegroundColor Green
        } else {
            throw "CLI deployment failed: $result2"
        }
    }
}
catch {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual deployment required:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://supabase.com/dashboard/project/$project/functions" -ForegroundColor Gray
    Write-Host "2. Click on 'qb-time-sync' function" -ForegroundColor Gray
    Write-Host "3. Click 'Deploy new version' or 'Redeploy'" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Testing deployment..." -ForegroundColor Cyan

# Test the deployed function
$testUrl = "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync"
$testBody = @{
    startDate = "2025-12-01"
    endDate = "2026-01-31"
    billableOnly = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $testUrl `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxODE0OTcsImV4cCI6MjA1Mzc1NzQ5N30.ZiV5jqcW3C78i-rWLNKfMZUfPLo-vGXaS1_1YEYyyvE"
            "Content-Type" = "application/json"
        } `
        -Body $testBody

    Write-Host ""
    Write-Host "Test Results:" -ForegroundColor Green
    Write-Host "  Synced: $($response.synced)" -ForegroundColor Gray
    Write-Host "  Total: $($response.total)" -ForegroundColor Gray
    Write-Host "  Date Range: $($response.dateRange.start) to $($response.dateRange.end)" -ForegroundColor Gray

    if ($response.synced -gt 0) {
        Write-Host ""
        Write-Host "SUCCESS! $($response.synced) time entries synced!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "WARNING: 0 entries synced. Check if there's data in that date range." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
