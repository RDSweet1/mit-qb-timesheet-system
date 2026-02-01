$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"
$projectRef = "migcpasmtbdojqphqyzc"

Write-Host "Executing approval workflow migration..." -ForegroundColor Cyan

# Run each SQL statement individually
$statements = @(
    "ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';"
    "ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_by TEXT;"
    "ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;"
    "ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;"
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_approve_time BOOLEAN DEFAULT false;"
    "CREATE INDEX IF NOT EXISTS idx_time_entries_approval_status ON time_entries(approval_status);"
    "CREATE INDEX IF NOT EXISTS idx_time_entries_pending ON time_entries(txn_date, approval_status) WHERE approval_status = 'pending';"
)

$count = 0
foreach ($stmt in $statements) {
    $count++
    Write-Host "[$count/$($statements.Count)] " -NoNewline -ForegroundColor Gray
    Write-Host $stmt.Substring(0, [Math]::Min(60, $stmt.Length)) -NoNewline -ForegroundColor Gray
    if ($stmt.Length > 60) { Write-Host "..." -NoNewline -ForegroundColor Gray }

    try {
        $body = @{
            query = $stmt
        } | ConvertTo-Json

        $response = Invoke-RestMethod `
            -Uri "https://$projectRef.supabase.co/rest/v1/rpc/query" `
            -Method Post `
            -Headers @{
                "apikey" = $serviceKey
                "Authorization" = "Bearer $serviceKey"
                "Content-Type" = "application/json"
                "Prefer" = "return=representation"
            } `
            -Body $body `
            -ErrorAction Stop

        Write-Host " OK" -ForegroundColor Green
    }
    catch {
        if ($_.Exception.Message -match "already exists|duplicate") {
            Write-Host " EXISTS" -ForegroundColor Yellow
        } else {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`nVerifying installation..." -ForegroundColor Cyan

$result = Invoke-RestMethod `
    -Uri "https://$projectRef.supabase.co/rest/v1/time_entries?select=approval_status&limit=1" `
    -Headers @{
        "apikey" = $serviceKey
        "Authorization" = "Bearer $serviceKey"
    }

Write-Host "SUCCESS - approval_status column is active!" -ForegroundColor Green
Write-Host "`nAll synced time entries now have approval_status='pending'" -ForegroundColor Gray
