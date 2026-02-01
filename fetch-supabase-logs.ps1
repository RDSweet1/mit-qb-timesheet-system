# Fetch Supabase Edge Function logs
$projectRef = "migcpasmtbdojqphqyzc"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"

Write-Host "Fetching recent Edge Function logs..." -ForegroundColor Cyan

try {
    # Use Supabase Management API to get logs
    $response = Invoke-RestMethod `
        -Uri "https://api.supabase.com/v1/projects/$projectRef/functions/qb-time-sync/logs" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $serviceKey"
        }

    Write-Host "`nRecent logs:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10

} catch {
    Write-Host "`nManual approach - Open logs in browser:" -ForegroundColor Yellow
    Write-Host "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions" -ForegroundColor Blue
    Write-Host "`nLook for: 'FULL FIRST ENTRY FOR DIAGNOSIS'" -ForegroundColor Yellow

    Start-Process "https://supabase.com/dashboard/project/$projectRef/logs/edge-functions"
}
