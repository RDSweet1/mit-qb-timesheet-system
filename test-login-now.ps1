# Test Microsoft Login - Final Verification

Write-Host "=== TESTING MICROSOFT LOGIN ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening production site..." -ForegroundColor Yellow

# Open the production site
Start-Process "https://rdsweet1.github.io/mit-qb-frontend/"

Write-Host ""
Write-Host "Site opened!" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Click 'Sign in with Microsoft'" -ForegroundColor White
Write-Host "2. Microsoft login popup should open" -ForegroundColor White
Write-Host "3. Sign in with your account" -ForegroundColor White
Write-Host "4. Accept the consent screen (if shown)" -ForegroundColor White
Write-Host "5. You should be redirected to the dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Expected changes from before:" -ForegroundColor Yellow
Write-Host "  - Login popup WILL open (not blocked)" -ForegroundColor Gray
Write-Host "  - NO 'response type token' error" -ForegroundColor Gray
Write-Host "  - Login will succeed" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter after you've tested the login"

Write-Host ""
Write-Host "Did the login work? (Y/N): " -ForegroundColor Yellow -NoNewline
$result = Read-Host

if ($result -eq "Y" -or $result -eq "y") {
    Write-Host ""
    Write-Host "🎉 SUCCESS! Microsoft login is working!" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Implicit grant tokens enabled" -ForegroundColor Green
    Write-Host "✅ Redirect URIs configured" -ForegroundColor Green
    Write-Host "✅ Authentication functional" -ForegroundColor Green
    Write-Host "✅ Persistent login enabled (localStorage)" -ForegroundColor Green
    Write-Host ""
    Write-Host "READY FOR PHASE 2: Report Generation!" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "What error did you see?" -ForegroundColor Yellow
    $error = Read-Host
    Write-Host ""
    Write-Host "Error captured: $error" -ForegroundColor Red
    Write-Host ""
    Write-Host "Let's troubleshoot this issue..." -ForegroundColor Yellow
}
