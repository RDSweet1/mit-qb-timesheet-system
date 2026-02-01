$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

Write-Host "Testing Production QuickBooks Functionality" -ForegroundColor Cyan

Write-Host "`nTest 1: Time Entry Sync" -ForegroundColor Yellow
$body = '{"startDate":"2026-01-01","endDate":"2026-01-30"}'
try {
    $result = Invoke-RestMethod -Uri "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" -Method POST -Headers @{"Authorization"="Bearer $apikey";"Content-Type"="application/json"} -Body $body
    Write-Host "Success: $($result.synced) entries synced" -ForegroundColor Green
    $result | ConvertTo-Json -Depth 2
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTest 2: Database Check" -ForegroundColor Yellow
$count = Invoke-RestMethod -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/time_entries?select=count" -Headers @{"apikey"=$apikey;"Prefer"="count=exact"}
Write-Host "Time entries in database: $($count[0].count)" -ForegroundColor Green
