# Get QB Online Production Token (NO QB Time scope needed)
$clientId = "ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO"
$clientSecret = "NEsyhDb1g5nficOBremLWghqSyfwvOLIhkrSBLye"
$redirectUri = "https://fluffy-frogs-jump.loca.lt/callback"
$scope = "com.intuit.quickbooks.accounting openid profile email"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "QB ONLINE TOKEN - NO QB TIME SCOPE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Build auth URL
$authUrl = "https://appcenter.intuit.com/connect/oauth2?" +
    "client_id=$clientId&" +
    "redirect_uri=$([uri]::EscapeDataString($redirectUri))&" +
    "response_type=code&" +
    "scope=$([uri]::EscapeDataString($scope))&" +
    "state=qbonline123"

Write-Host "STEP 1: Copy this URL and open it in your browser:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor Blue
Write-Host ""

Write-Host "STEP 2: Sign in and authorize" -ForegroundColor Yellow
Write-Host ""

Write-Host "STEP 3: You'll be redirected. Copy the entire callback URL" -ForegroundColor Yellow
Write-Host ""

Write-Host "STEP 4: Paste the callback URL here" -ForegroundColor Yellow
$callbackUrl = Read-Host "Paste full callback URL"

if ([string]::IsNullOrWhiteSpace($callbackUrl)) {
    Write-Host "`nERROR: No URL provided!" -ForegroundColor Red
    exit
}

# Extract code from URL
if ($callbackUrl -match "code=([^&]+)") {
    $code = $matches[1]
    Write-Host "`nExtracted code: $($code.Substring(0, 20))..." -ForegroundColor Green
} else {
    Write-Host "`nERROR: Could not find code in URL!" -ForegroundColor Red
    exit
}

Write-Host "`nExchanging code for tokens..." -ForegroundColor Yellow

$tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
$body = "grant_type=authorization_code&code=$code&redirect_uri=$redirectUri"
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

    Write-Host "`n✓ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access Token: $($response.access_token.Substring(0, 50))..." -ForegroundColor Cyan
    Write-Host "Refresh Token: $($response.refresh_token.Substring(0, 30))..." -ForegroundColor Cyan
    Write-Host "Realm ID: $($response.realmId)" -ForegroundColor Cyan

    # Update .env
    $envLine = "`n# QuickBooks Online Production (added $(Get-Date))`nQB_ACCESS_TOKEN=$($response.access_token)`nQB_REFRESH_TOKEN=$($response.refresh_token)`nQB_REALM_ID=$($response.realmId)`n"
    Add-Content .env $envLine

    Write-Host "`n✓ Tokens saved to .env file!" -ForegroundColor Green
    Write-Host "`nNow run: node test-qb-online-time-data.js" -ForegroundColor Yellow

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
