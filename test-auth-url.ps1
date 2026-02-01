# Test the Microsoft authentication URL that would be generated
$clientId = "973b689d-d96c-4445-883b-739fff12330b"
$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"
$redirectUri = "https://rdsweet1.github.io/mit-qb-frontend/"
$scope = "User.Read email profile openid"

# Construct the authorization URL (what MSAL generates)
$state = [guid]::NewGuid().ToString()
$nonce = [guid]::NewGuid().ToString()

$authUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/authorize?" +
    "client_id=$clientId&" +
    "response_type=id_token token&" +
    "redirect_uri=$([System.Web.HttpUtility]::UrlEncode($redirectUri))&" +
    "scope=$([System.Web.HttpUtility]::UrlEncode($scope))&" +
    "response_mode=fragment&" +
    "state=$state&" +
    "nonce=$nonce"

Write-Host "=== TESTING AZURE AD AUTHENTICATION ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated Auth URL:" -ForegroundColor Yellow
Write-Host $authUrl
Write-Host ""
Write-Host "Opening Microsoft login page..." -ForegroundColor Green

# Try to open the auth URL
try {
    Start-Process $authUrl
    Write-Host ""
    Write-Host "=== WHAT TO EXPECT ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✅ SUCCESS: You'll see Microsoft login page, sign in, and redirect back" -ForegroundColor Green
    Write-Host ""
    Write-Host "❌ FAILURE SCENARIOS:" -ForegroundColor Red
    Write-Host "  1. Error AADSTS50011: 'The redirect URI specified in the request does not match...'"
    Write-Host "     → Solution: Add redirect URI in Azure Portal"
    Write-Host ""
    Write-Host "  2. Error AADSTS700016: 'Application not found'"
    Write-Host "     → Solution: Check Client ID is correct"
    Write-Host ""
    Write-Host "  3. Error AADSTS90014: 'The request body must contain the following parameter...'"
    Write-Host "     → Solution: Check token settings in Azure Portal"
    Write-Host ""
    Write-Host "Copy the full error message if you see one!" -ForegroundColor Yellow
} catch {
    Write-Host "Error opening browser: $_" -ForegroundColor Red
}
