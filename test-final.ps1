# FINAL TEST: Verify everything is working
Write-Host "=== FINAL DEPLOYMENT VERIFICATION ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check redirect URI in deployed code
Write-Host "[1/4] Checking deployed redirect URI..." -ForegroundColor Yellow
$layoutBundle = curl -s "https://rdsweet1.github.io/mit-qb-frontend/" | Select-String -Pattern 'static/chunks/app/layout-[^"]*\.js' | ForEach-Object { $_.Matches[0].Value }

if ($layoutBundle) {
    Write-Host "   Bundle: $layoutBundle" -ForegroundColor Gray
    $content = curl -s "https://rdsweet1.github.io/mit-qb-frontend/_next/$layoutBundle"

    if ($content -match 'redirectUri:"([^"]*)"') {
        $redirectUri = $matches[1]
        if ($redirectUri -eq "https://rdsweet1.github.io/mit-qb-frontend/") {
            Write-Host "   ✅ Redirect URI: $redirectUri (WITH trailing slash)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Redirect URI: $redirectUri (check if trailing slash is needed)" -ForegroundColor Yellow
        }
    }

    # Check Azure credentials
    if ($content -match '973b689d-d96c-4445-883b-739fff12330b') {
        Write-Host "   ✅ Azure Client ID found in code" -ForegroundColor Green
    }

    if ($content -match 'localStorage') {
        Write-Host "   ✅ localStorage configured (persistent login enabled)" -ForegroundColor Green
    }
}
Write-Host ""

# Test 2: Open the production site
Write-Host "[2/4] Opening production site..." -ForegroundColor Yellow
Start-Process msedge.exe "https://rdsweet1.github.io/mit-qb-frontend/"
Start-Sleep -Seconds 2
Write-Host "   ✅ Site opened in Edge" -ForegroundColor Green
Write-Host ""

# Test 3: Generate auth URL
Write-Host "[3/4] Generating Microsoft login URL..." -ForegroundColor Yellow
$clientId = "973b689d-d96c-4445-883b-739fff12330b"
$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"
$redirectUri = "https://rdsweet1.github.io/mit-qb-frontend/"
$state = [guid]::NewGuid().ToString()
$nonce = [guid]::NewGuid().ToString()

Add-Type -AssemblyName System.Web
$authUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/authorize?" +
    "client_id=$clientId&" +
    "response_type=id_token token&" +
    "redirect_uri=$([System.Web.HttpUtility]::UrlEncode($redirectUri))&" +
    "scope=User.Read email profile openid&" +
    "response_mode=fragment&" +
    "state=$state&" +
    "nonce=$nonce"

Write-Host "   ✅ Auth URL generated" -ForegroundColor Green
Write-Host ""

# Test 4: Manual test instructions
Write-Host "[4/4] MANUAL TEST INSTRUCTIONS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "In the browser that just opened:" -ForegroundColor White
Write-Host "  1. Press F12 to open DevTools" -ForegroundColor White
Write-Host "  2. Go to Console tab" -ForegroundColor White
Write-Host "  3. Click 'Sign in with Microsoft' button" -ForegroundColor White
Write-Host ""
Write-Host "Expected Outcomes:" -ForegroundColor Yellow
Write-Host ""
Write-Host "✅ SUCCESS:" -ForegroundColor Green
Write-Host "   - Microsoft login popup opens" -ForegroundColor Gray
Write-Host "   - You can sign in with your account" -ForegroundColor Gray
Write-Host "   - After login, redirects back to dashboard" -ForegroundColor Gray
Write-Host ""
Write-Host "❌ ERROR: AADSTS50011 (Redirect URI mismatch)" -ForegroundColor Red
Write-Host "   Solution: Add these URIs in Azure Portal:" -ForegroundColor Yellow
Write-Host "   - https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Gray
Write-Host "   - https://rdsweet1.github.io/mit-qb-frontend (without slash, for safety)" -ForegroundColor Gray
Write-Host ""
Write-Host "   Steps:" -ForegroundColor Yellow
Write-Host "   1. Go to: https://portal.azure.com" -ForegroundColor Gray
Write-Host "   2. Azure AD → App registrations → QuickBooks Timesheet System" -ForegroundColor Gray
Write-Host "   3. Authentication → Add URI (Single-page application)" -ForegroundColor Gray
Write-Host "   4. Add both URIs above" -ForegroundColor Gray
Write-Host "   5. Enable 'Access tokens' and 'ID tokens'" -ForegroundColor Gray
Write-Host "   6. Save" -ForegroundColor Gray
Write-Host ""
Write-Host "❌ OTHER ERRORS:" -ForegroundColor Red
Write-Host "   Copy the full error message and share it" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== READY FOR TESTING ===" -ForegroundColor Cyan
Write-Host "Click the login button now and report what happens!" -ForegroundColor White
