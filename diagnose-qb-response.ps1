# Diagnostic script to see what QB returns for time entries
$projectRef = "migcpasmtbdojqphqyzc"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

Write-Host "`nQUICKBOOKS TIME FORMAT DIAGNOSTIC`n" -ForegroundColor Cyan
Write-Host "This will sync 1 day of data and show the full QB response`n"

# Call sync for just one day to minimize data
$body = @{
    startDate = "2025-12-31"
    endDate = "2025-12-31"
} | ConvertTo-Json

Write-Host "Calling QB sync for 2025-12-31..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod `
        -Uri "https://$projectRef.supabase.co/functions/v1/qb-time-sync" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $anonKey"
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`nSync Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5

    Write-Host "`n`nNow check Supabase logs for the FULL QB response:" -ForegroundColor Cyan
    Write-Host "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions" -ForegroundColor Blue
    Write-Host "`nLook for the line: 'FULL FIRST ENTRY FOR DIAGNOSIS'" -ForegroundColor Yellow

} catch {
    Write-Host "`nError calling sync:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

Write-Host "`nPress any key to open Supabase logs in browser..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Start-Process "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions"
