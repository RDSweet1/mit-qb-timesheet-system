# Add Redirect URI to QuickBooks App
Write-Host "`n=== ADD REDIRECT URI TO QUICKBOOKS APP ===`n" -ForegroundColor Cyan

Write-Host "To complete the OAuth setup, you need to add the redirect URI to your QuickBooks app." -ForegroundColor Yellow
Write-Host ""
Write-Host "STEP 1: Open QuickBooks Developer Portal" -ForegroundColor Green
Write-Host "Opening your browser to the QuickBooks Developer Dashboard..." -ForegroundColor Gray

$dashboardUrl = "https://developer.intuit.com/app/developer/myapps"
Start-Process $dashboardUrl

Write-Host ""
Write-Host "STEP 2: Navigate to Your App" -ForegroundColor Green
Write-Host "1. Find and click on your app: 'Weekly Activity Report'" -ForegroundColor Gray
Write-Host "2. Go to 'Keys & OAuth' or 'Keys & credentials' tab" -ForegroundColor Gray

Write-Host ""
Write-Host "STEP 3: Add Redirect URI" -ForegroundColor Green
Write-Host "In the 'Redirect URIs' section, add this URI:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   http://localhost:8000/callback" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then click 'Save' or 'Add' button" -ForegroundColor Gray

Write-Host ""
Write-Host "STEP 4: Run OAuth Script Again" -ForegroundColor Green
Write-Host "After saving, run this command:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   node qb-time-oauth-automated-v2.js" -ForegroundColor Cyan
Write-Host ""

Write-Host "Press Enter after you've added the redirect URI..." -ForegroundColor Yellow
Read-Host

Write-Host "`nGreat! Now running the OAuth automation..." -ForegroundColor Green
node qb-time-oauth-automated-v2.js
