# Execute Approval Workflow Migration via Supabase API
$projectRef = "migcpasmtbdojqphqyzc"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"

Write-Host "`nExecuting approval workflow migration..." -ForegroundColor Cyan

# Read and execute the SQL file directly using psql via Docker
$sqlFile = "sql/add-approval-workflow.sql"

# Get database connection info from Supabase
$dbUrl = "postgresql://postgres.migcpasmtbdojqphqyzc:Mitch$1961@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

Write-Host "`nRunning SQL migration..." -NoNewline

try {
    # Execute SQL file using psql
    $result = docker run --rm -i postgres:15 psql "$dbUrl" < $sqlFile 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host " SUCCESS" -ForegroundColor Green
        Write-Host "`nMigration completed successfully!" -ForegroundColor Green
    } else {
        throw "Migration failed: $result"
    }
}
catch {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nTrying alternative method..." -ForegroundColor Yellow

    # Alternative: Use Supabase CLI
    cd supabase
    npx supabase db push --project-ref $projectRef
}

Write-Host "`nVerifying installation..." -ForegroundColor Cyan

# Check if columns were added
$checkQuery = @"
SELECT column_name FROM information_schema.columns
WHERE table_name = 'time_entries'
AND column_name IN ('approval_status', 'approved_by', 'approved_at')
"@

$uri = "https://$projectRef.supabase.co/rest/v1/rpc/exec"
$headers = @{
    "apikey" = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type" = "application/json"
}

try {
    # Just query the table to verify
    $testUri = "https://$projectRef.supabase.co/rest/v1/time_entries?select=approval_status&limit=1"
    $result = Invoke-RestMethod -Uri $testUri -Headers $headers

    Write-Host "SUCCESS - approval_status column exists!" -ForegroundColor Green
}
catch {
    Write-Host "WARNING - Could not verify migration" -ForegroundColor Yellow
}

Write-Host "`nDone!" -ForegroundColor Green
