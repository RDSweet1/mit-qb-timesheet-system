# YOLO MODE: Live browser test of Microsoft login
Write-Host "=== TESTING MICROSOFT LOGIN ===" -ForegroundColor Cyan
Write-Host ""

# Use Edge to open the site and capture console
$url = "https://rdsweet1.github.io/mit-qb-frontend/"

Write-Host "[1/3] Opening production site in Edge..." -ForegroundColor Yellow
Start-Process msedge.exe $url

Write-Host ""
Write-Host "[2/3] MANUAL TEST STEPS:" -ForegroundColor Green
Write-Host "  1. The site should open in your browser"
Write-Host "  2. Open DevTools: Press F12"
Write-Host "  3. Go to Console tab"
Write-Host "  4. Click 'Sign in with Microsoft' button"
Write-Host "  5. Watch for:"
Write-Host "     - Does a Microsoft login popup open?"
Write-Host "     - Any console errors?"
Write-Host "     - What's the error message?"
Write-Host ""

Write-Host "[3/3] Common Issues:" -ForegroundColor Yellow
Write-Host "  - AADSTS50011: Redirect URI not configured in Azure Portal"
Write-Host "  - Popup blocked: Allow popups for this site"
Write-Host "  - No popup: Check console for JavaScript errors"
Write-Host ""

Write-Host "=== WAITING FOR YOUR FEEDBACK ===" -ForegroundColor Cyan
Write-Host "What happened when you clicked the login button?" -ForegroundColor White
Write-Host "(Copy any error messages from the console)" -ForegroundColor Gray
