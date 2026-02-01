# Get QB Time OAuth Token using existing QB credentials
$clientId = "ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO"
$clientSecret = "NEsyhDb1g5nficOBremLWghqSyfwvOLIhkrSBLye"

Write-Host "`nQUICKBOOKS TIME OAUTH FLOW`n" -ForegroundColor Cyan

# Step 1: Generate authorization URL
$redirectUri = "http://localhost:8000/callback"
$scope = "com.intuit.quickbooks.accounting openid profile email com.intuit.quickbooks.payroll.timetracking"

$authUrl = "https://appcenter.intuit.com/connect/oauth2?" +
    "client_id=$clientId&" +
    "redirect_uri=$redirectUri&" +
    "response_type=code&" +
    "scope=$scope&" +
    "state=security_token_123"

Write-Host "STEP 1: Authorize QB Time Access" -ForegroundColor Yellow
Write-Host ""
Write-Host "Opening browser to authorize QB Time..." -ForegroundColor Gray
Write-Host ""
Write-Host "URL: $authUrl" -ForegroundColor Blue
Write-Host ""

Start-Process $authUrl

Write-Host "After authorizing, you'll be redirected to:" -ForegroundColor Yellow
Write-Host "$redirectUri?code=XXXXX&state=security_token_123" -ForegroundColor Gray
Write-Host ""

# Step 2: Get authorization code from user
Write-Host "STEP 2: Copy Authorization Code" -ForegroundColor Yellow
Write-Host "After clicking 'Authorize', copy the 'code' parameter from the URL" -ForegroundColor Gray
Write-Host ""
$authCode = Read-Host "Paste authorization code here"

# Step 3: Exchange code for tokens
Write-Host "`nSTEP 3: Exchange code for tokens..." -ForegroundColor Yellow

$tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
$body = "grant_type=authorization_code&code=$authCode&redirect_uri=$redirectUri"
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))

try {
    $response = Invoke-RestMethod `
        -Uri $tokenUrl `
        -Method POST `
        -Headers @{
            "Authorization" = "Basic $auth"
            "Content-Type" = "application/x-www-form-urlencoded"
        } `
        -Body $body

    Write-Host "`nSUCCESS! Got QB Time Tokens:" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access Token:" -ForegroundColor Cyan
    Write-Host $response.access_token -ForegroundColor Gray
    Write-Host ""
    Write-Host "Refresh Token:" -ForegroundColor Cyan
    Write-Host $response.refresh_token -ForegroundColor Gray
    Write-Host ""

    Write-Host "Add these to Supabase Edge Function Secrets:" -ForegroundColor Yellow
    Write-Host "QB_TIME_ACCESS_TOKEN=$($response.access_token)" -ForegroundColor Blue
    Write-Host "QB_TIME_REFRESH_TOKEN=$($response.refresh_token)" -ForegroundColor Blue

    # Save to file
    $tokens = @"
# Add these to Supabase:
# https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/functions

QB_TIME_ACCESS_TOKEN=$($response.access_token)
QB_TIME_REFRESH_TOKEN=$($response.refresh_token)
"@

    $tokens | Out-File "qb-time-tokens.txt"
    Write-Host "`nTokens saved to: qb-time-tokens.txt" -ForegroundColor Green

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
