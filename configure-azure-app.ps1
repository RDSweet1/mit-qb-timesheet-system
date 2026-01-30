# Azure App Configuration Script
# Fixes: 1. Enable implicit grant tokens
#        2. Add redirect URIs
#        3. Add Mail.Send permissions

$appId = "973b689d-d96c-4445-883b-739fff12330b"
$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"

Write-Host "=== AZURE APP CONFIGURATION ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will guide you through configuring the Azure app." -ForegroundColor Yellow
Write-Host "You'll need to be signed in to Azure Portal." -ForegroundColor Yellow
Write-Host ""

# Open Azure Portal to the app
$portalUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/$appId"

Write-Host "[STEP 1] Opening Azure Portal..." -ForegroundColor Green
Write-Host "URL: $portalUrl" -ForegroundColor Gray
Start-Process $portalUrl
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== CONFIGURATION STEPS ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] ENABLE IMPLICIT GRANT TOKENS" -ForegroundColor Yellow
Write-Host "    This fixes: 'response type token is not enabled'" -ForegroundColor Gray
Write-Host ""
Write-Host "    On the Authentication page that just opened:" -ForegroundColor White
Write-Host "    1. Scroll to 'Implicit grant and hybrid flows'" -ForegroundColor White
Write-Host "    2. ☑ Check 'Access tokens (used for implicit flows)'" -ForegroundColor Green
Write-Host "    3. ☑ Check 'ID tokens (used for implicit and hybrid flows)'" -ForegroundColor Green
Write-Host "    4. Click 'Save' at the top" -ForegroundColor White
Write-Host ""

Write-Host "[2] ADD REDIRECT URIs" -ForegroundColor Yellow
Write-Host "    Still on the Authentication page:" -ForegroundColor White
Write-Host ""
Write-Host "    1. Under 'Single-page application', click 'Add URI'" -ForegroundColor White
Write-Host "    2. Add: https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Cyan
Write-Host "    3. Click 'Add URI' again" -ForegroundColor White
Write-Host "    4. Add: https://rdsweet1.github.io/mit-qb-frontend" -ForegroundColor Cyan
Write-Host "    5. Add: http://localhost:3000" -ForegroundColor Cyan
Write-Host "    6. Click 'Save'" -ForegroundColor White
Write-Host ""

Write-Host "[3] ADD MAIL PERMISSIONS" -ForegroundColor Yellow
Write-Host "    1. Click 'API permissions' in the left sidebar" -ForegroundColor White
Write-Host "    2. Click 'Add a permission'" -ForegroundColor White
Write-Host "    3. Click 'Microsoft Graph'" -ForegroundColor White
Write-Host "    4. Click 'Delegated permissions'" -ForegroundColor White
Write-Host "    5. Search for and add:" -ForegroundColor White
Write-Host "       ☑ Mail.Send" -ForegroundColor Green
Write-Host "       ☑ Mail.ReadWrite" -ForegroundColor Green
Write-Host "    6. Click 'Add permissions'" -ForegroundColor White
Write-Host "    7. Click 'Grant admin consent for [your tenant]'" -ForegroundColor White
Write-Host "    8. Click 'Yes' to confirm" -ForegroundColor White
Write-Host ""

Write-Host "=== VERIFICATION ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "After completing the above steps:" -ForegroundColor Yellow
Write-Host "1. Wait 2-3 minutes for changes to propagate" -ForegroundColor White
Write-Host "2. Go to: https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Cyan
Write-Host "3. Click 'Sign in with Microsoft'" -ForegroundColor White
Write-Host "4. Login should work!" -ForegroundColor Green
Write-Host ""

Write-Host "Press Enter when you've completed all steps..." -ForegroundColor Yellow
Read-Host

Write-Host ""
Write-Host "Great! Now let's test the login..." -ForegroundColor Green
Start-Process "https://rdsweet1.github.io/mit-qb-frontend/"

Write-Host ""
Write-Host "=== TESTING ===" -ForegroundColor Cyan
Write-Host "1. Click 'Sign in with Microsoft'" -ForegroundColor White
Write-Host "2. Sign in with your account" -ForegroundColor White
Write-Host "3. You should be redirected to the dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Did it work? (Y/N): " -ForegroundColor Yellow -NoNewline
$result = Read-Host

if ($result -eq "Y" -or $result -eq "y") {
    Write-Host ""
    Write-Host "🎉 SUCCESS! Login is working!" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Implicit grant tokens enabled" -ForegroundColor Green
    Write-Host "✅ Redirect URIs configured" -ForegroundColor Green
    Write-Host "✅ Mail permissions added" -ForegroundColor Green
    Write-Host "✅ Microsoft login functional" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ready for Phase 2: Report Generation" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "What error did you see?" -ForegroundColor Yellow
    Write-Host "(Copy and paste the error message)" -ForegroundColor Gray
    $error = Read-Host
    Write-Host ""
    Write-Host "Error captured: $error" -ForegroundColor Red
    Write-Host "Please share this error so we can troubleshoot." -ForegroundColor Yellow
}
