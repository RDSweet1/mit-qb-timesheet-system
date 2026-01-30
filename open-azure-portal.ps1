# Open Azure Portal to the exact configuration pages

$appId = "973b689d-d96c-4445-883b-739fff12330b"

Write-Host "Opening Azure Portal configuration pages..." -ForegroundColor Cyan
Write-Host ""

# Open Authentication page
$authUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/$appId"
Start-Process $authUrl

Start-Sleep -Seconds 2

# Open API Permissions page
$apiUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$appId"
Start-Process $apiUrl

Write-Host "✓ Opened Authentication page (for implicit grant + redirect URIs)" -ForegroundColor Green
Write-Host "✓ Opened API Permissions page (for Mail permissions)" -ForegroundColor Green
Write-Host ""
Write-Host "Follow the steps in AZURE-MANUAL-STEPS.md" -ForegroundColor Yellow
