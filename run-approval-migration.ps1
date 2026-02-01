# Run Approval Workflow Migration
# Adds approval_status column and workflow to time_entries

$projectRef = "migcpasmtbdojqphqyzc"
$serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"

Write-Host ""
Write-Host "Running Approval Workflow Migration..." -ForegroundColor Cyan
Write-Host ""

# Read the SQL file
$sql = Get-Content "sql/add-approval-workflow.sql" -Raw

# Split into individual statements (rough split by semicolon)
$statements = $sql -split ";\s*(?=\n|$)" | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("--") }

Write-Host "Executing $($statements.Count) SQL statements..." -ForegroundColor Yellow
Write-Host ""

$successCount = 0
$errorCount = 0

foreach ($statement in $statements) {
    $trimmed = $statement.Trim()
    if (-not $trimmed) { continue }

    # Extract first line for logging
    $firstLine = ($trimmed -split "`n")[0]
    if ($firstLine.Length > 80) {
        $firstLine = $firstLine.Substring(0, 77) + "..."
    }

    Write-Host "  $firstLine" -NoNewline -ForegroundColor Gray

    try {
        $response = Invoke-RestMethod `
            -Uri "https://$projectRef.supabase.co/rest/v1/rpc/exec_sql" `
            -Method Post `
            -Headers @{
                "apikey" = $serviceRoleKey
                "Authorization" = "Bearer $serviceRoleKey"
                "Content-Type" = "application/json"
            } `
            -Body (@{ query = $trimmed } | ConvertTo-Json) `
            -ErrorAction Stop

        Write-Host " OK" -ForegroundColor Green
        $successCount++
    }
    catch {
        # Some statements might fail if already exists, that's OK
        $errorMsg = $_.Exception.Message
        if ($errorMsg -match "already exists|duplicate") {
            Write-Host " SKIP" -ForegroundColor Yellow
        } else {
            Write-Host " ERROR" -ForegroundColor Red
            Write-Host "    $errorMsg" -ForegroundColor Red
            $errorCount++
        }
    }
}

Write-Host ""
Write-Host "Migration complete!" -ForegroundColor Green
Write-Host "  Success: $successCount" -ForegroundColor Gray
Write-Host "  Errors: $errorCount" -ForegroundColor Gray

if ($errorCount -gt 5) {
    Write-Host ""
    Write-Host "WARNING: Many errors occurred. Manual migration may be needed." -ForegroundColor Yellow
    Write-Host "Go to: https://supabase.com/dashboard/project/$projectRef/sql" -ForegroundColor Gray
    Write-Host "And paste the contents of sql/add-approval-workflow.sql" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "Approval workflow is now active!" -ForegroundColor Green
    Write-Host ""
    Write-Host "New features available:" -ForegroundColor Cyan
    Write-Host "  - Time entries default to 'pending' status" -ForegroundColor Gray
    Write-Host "  - Approve/Reject entries before invoicing" -ForegroundColor Gray
    Write-Host "  - Track who approved and when" -ForegroundColor Gray
    Write-Host "  - Views for pending, approved, and invoiced entries" -ForegroundColor Gray
}

Write-Host ""
