# Test QB Online sync with full diagnostic logging
$projectRef = "migcpasmtbdojqphqyzc"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

Write-Host "`n=== QB ONLINE DIAGNOSTIC SYNC ===`n" -ForegroundColor Cyan
Write-Host "This will show EXACTLY what QuickBooks returns for start/end times`n" -ForegroundColor Yellow

# Sync Dec 31 (should have entries with times)
$body = @{
    startDate = "2025-12-31"
    endDate = "2025-12-31"
} | ConvertTo-Json

Write-Host "Calling qb-online-sync function..." -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "https://$projectRef.supabase.co/functions/v1/qb-online-sync" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $anonKey"
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`nSync Result:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3

    Write-Host "`n`n========================================" -ForegroundColor Cyan
    Write-Host "NOW CHECK SUPABASE LOGS FOR FULL DETAILS" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    Write-Host "Opening Supabase logs..." -ForegroundColor Yellow
    Write-Host "Look for: '=== FULL FIRST ENTRY FOR DIAGNOSIS ==='" -ForegroundColor Green
    Write-Host "`nYou'll see the complete JSON from QB including:" -ForegroundColor Yellow
    Write-Host "  - All field names QB actually uses" -ForegroundColor Gray
    Write-Host "  - StartTime/EndTime values (if they exist)" -ForegroundColor Gray
    Write-Host "  - Any time-related fields we might have missed`n" -ForegroundColor Gray

    Start-Sleep -Seconds 2
    Start-Process "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions?search=DIAGNOSIS"

} catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception
}
