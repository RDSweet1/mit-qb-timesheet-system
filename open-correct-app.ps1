# Open the CORRECT Azure app - QuickBooks Timesheet System

$appId = "973b689d-d96c-4445-883b-739fff12330b"

Write-Host "Opening CORRECT app: QuickBooks Timesheet System" -ForegroundColor Green
Write-Host "App ID: $appId" -ForegroundColor Gray
Write-Host ""

# Authentication page
$authUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/$appId"
Start-Process $authUrl

Write-Host "Opening Authentication page..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

# API Permissions page
$apiUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$appId"
Start-Process $apiUrl

Write-Host "Opening API Permissions page..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Look for: QuickBooks Timesheet System" -ForegroundColor Yellow
Write-Host "NOT: Sharepoint Python Connector" -ForegroundColor Red
