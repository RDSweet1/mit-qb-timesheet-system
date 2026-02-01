# Check what QB actually returns for time entries with start/end times
$projectRef = "migcpasmtbdojqphqyzc"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

Write-Host "`nCHECKING QB ONLINE API RESPONSE STRUCTURE`n" -ForegroundColor Cyan

Write-Host "This will sync from QB Online and show you the FULL response" -ForegroundColor Yellow
Write-Host "Look for the start/end time field names QB actually uses`n" -ForegroundColor Yellow

# Sync one day
$body = @{
    startDate = "2025-12-31"
    endDate = "2025-12-31"
} | ConvertTo-Json

Write-Host "Calling QB Online sync..." -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "https://$projectRef.supabase.co/functions/v1/qb-time-sync" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $anonKey"
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`nSync completed:" -ForegroundColor Green
    $response | ConvertTo-Json

    Write-Host "`n`n=== NOW CHECK SUPABASE LOGS ===" -ForegroundColor Cyan
    Write-Host "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions`n" -ForegroundColor Blue

    Write-Host "Look for the log line that says:" -ForegroundColor Yellow
    Write-Host "'FULL FIRST ENTRY FOR DIAGNOSIS'" -ForegroundColor Green
    Write-Host "`nIn that JSON, search for fields like:" -ForegroundColor Yellow
    Write-Host "  - StartTime, Start, start_time" -ForegroundColor Gray
    Write-Host "  - EndTime, End, end_time" -ForegroundColor Gray
    Write-Host "  - ClockIn, ClockOut" -ForegroundColor Gray
    Write-Host "  - TimeActivityDetail" -ForegroundColor Gray
    Write-Host "  - Or any nested time objects`n" -ForegroundColor Gray

    Write-Host "Press any key to open logs..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Start-Process "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions"

} catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
}
