# Run QB Time columns migration
$projectRef = "migcpasmtbdojqphqyzc"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"

Write-Host "`nADDING QB TIME COLUMNS TO DATABASE`n" -ForegroundColor Cyan

# Read SQL file
$sql = Get-Content "sql\add-qb-time-columns.sql" -Raw

Write-Host "Executing migration..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod `
        -Uri "https://$projectRef.supabase.co/rest/v1/rpc/exec_sql" `
        -Method POST `
        -Headers @{
            "apikey" = $serviceKey
            "Authorization" = "Bearer $serviceKey"
            "Content-Type" = "application/json"
        } `
        -Body (@{ query = $sql } | ConvertTo-Json)

    Write-Host "`n SUCCESS: QB Time columns added!" -ForegroundColor Green
    Write-Host "  - qb_time_timesheet_id (TEXT, UNIQUE)" -ForegroundColor Gray
    Write-Host "  - qb_time_synced_at (TIMESTAMPTZ)" -ForegroundColor Gray

} catch {
    Write-Host "`n ERROR: Could not run migration via API" -ForegroundColor Red
    Write-Host "Please run manually in Supabase SQL Editor:" -ForegroundColor Yellow
    Write-Host "https://supabase.com/dashboard/project/$projectRef/sql" -ForegroundColor Blue
    Write-Host "`nSQL to run:" -ForegroundColor Yellow
    Write-Host $sql -ForegroundColor Gray
}
