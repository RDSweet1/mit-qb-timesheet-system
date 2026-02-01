$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

Write-Host "Testing Time Entry Sync - Broader Date Range" -ForegroundColor Cyan
Write-Host ""

# Try last 6 months
$body = '{"startDate":"2025-08-01","endDate":"2026-01-30"}'
Write-Host "Syncing: Aug 2025 - Jan 2026" -ForegroundColor Yellow

$result = Invoke-RestMethod -Uri "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" -Method POST -Headers @{"Authorization"="Bearer $apikey";"Content-Type"="application/json"} -Body $body

Write-Host ""
Write-Host "Results:" -ForegroundColor Green
Write-Host "  Total in QB: $($result.total)"
Write-Host "  Synced to DB: $($result.synced)"
Write-Host ""

if ($result.total -gt 0 -and $result.entries) {
    Write-Host "Sample entries:" -ForegroundColor Cyan
    $result.entries | Select-Object -First 5 | Format-Table employee_name, txn_date, hours, minutes, description -AutoSize
}

$dbCount = Invoke-RestMethod -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/time_entries?select=count" -Headers @{"apikey"=$apikey;"Prefer"="count=exact"}
Write-Host ""
Write-Host "Database total: $($dbCount[0].count) time entries" -ForegroundColor Green
