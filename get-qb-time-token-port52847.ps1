# QB Time OAuth using port 52847
$clientId = "ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO"
$clientSecret = "NEsyhDb1g5nficOBremLWghqSyfwvOLIhkrSBLye"
$port = 52847
$redirectUri = "http://localhost:$port/callback"

Write-Host "`n=== QB TIME OAUTH (Port $port) ===`n" -ForegroundColor Cyan

# Generate auth URL with QB Time scope
$scope = "com.intuit.quickbooks.accounting openid profile email com.intuit.quickbooks.payroll.timetracking"
$authUrl = "https://appcenter.intuit.com/connect/oauth2?" +
    "client_id=$clientId&" +
    "redirect_uri=$([uri]::EscapeDataString($redirectUri))&" +
    "response_type=code&" +
    "scope=$([uri]::EscapeDataString($scope))&" +
    "state=qbtime123"

Write-Host "Opening authorization URL..." -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor Blue
Write-Host ""

Start-Process $authUrl

Write-Host "After authorizing, copy the CODE from the redirect URL" -ForegroundColor Yellow
Write-Host "URL will look like: http://localhost:52847/callback?code=XXXXX&state=qbtime123" -ForegroundColor Gray
Write-Host ""

$code = Read-Host "Paste authorization code here"

if ([string]::IsNullOrWhiteSpace($code)) {
    Write-Host "`nERROR: No code provided!" -ForegroundColor Red
    exit
}

Write-Host "`nExchanging code for QB Time token..." -ForegroundColor Yellow

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

    Write-Host "`n SUCCESS! Got QB Time Token!`n" -ForegroundColor Green

    $token = $response.access_token

    # Save to .env
    Add-Content .env "`n# QuickBooks Time (added $(Get-Date))`nQB_TIME_ACCESS_TOKEN=$token`nQB_TIME_REFRESH_TOKEN=$($response.refresh_token)"

    Write-Host "Token added to .env file!" -ForegroundColor Green
    Write-Host "`nNext: Add to Supabase secrets" -ForegroundColor Yellow
    Write-Host "QB_TIME_ACCESS_TOKEN=$($token.Substring(0,50))..." -ForegroundColor Gray

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
