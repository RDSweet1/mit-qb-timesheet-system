# Simple QB Time Authorization - Manual Steps (DEVELOPMENT)
$clientId = "ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a"
$clientSecret = "O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU"
$port = 52847
$redirectUri = "http://localhost:$port/callback"
$scope = "com.intuit.quickbooks.accounting openid profile email com.intuit.quickbooks.payroll.timetracking"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "QB TIME OAUTH - SIMPLE MANUAL PROCESS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Build auth URL
$authUrl = "https://appcenter.intuit.com/connect/oauth2?" +
    "client_id=$clientId&" +
    "redirect_uri=$([uri]::EscapeDataString($redirectUri))&" +
    "response_type=code&" +
    "scope=$([uri]::EscapeDataString($scope))&" +
    "state=qbtime123"

Write-Host "STEP 1: Copy this URL and open it in your browser:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor Blue
Write-Host ""

Write-Host "STEP 2: Sign in to QuickBooks and authorize the app" -ForegroundColor Yellow
Write-Host ""

Write-Host "STEP 3: You'll see an error page (this is expected)" -ForegroundColor Yellow
Write-Host "        The URL will look like:" -ForegroundColor Gray
Write-Host "        http://localhost:52847/callback?code=XXXXX&state=qbtime123" -ForegroundColor Gray
Write-Host ""

Write-Host "STEP 4: Copy the CODE from that URL and paste it below" -ForegroundColor Yellow
Write-Host "        (Copy everything between 'code=' and '&state')" -ForegroundColor Gray
Write-Host ""

$code = Read-Host "Paste authorization code here"

if ([string]::IsNullOrWhiteSpace($code)) {
    Write-Host "`nERROR: No code provided!" -ForegroundColor Red
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

    Write-Host "`n SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Access Token: $($response.access_token.Substring(0, 50))..." -ForegroundColor Cyan
    Write-Host "Refresh Token: $($response.refresh_token.Substring(0, 30))..." -ForegroundColor Cyan

    # Save to .env
    $envLine = "`n# QuickBooks Time (added $(Get-Date))`nQB_TIME_ACCESS_TOKEN=$($response.access_token)`nQB_TIME_REFRESH_TOKEN=$($response.refresh_token)"
    Add-Content .env $envLine

    Write-Host "`n Tokens saved to .env file!" -ForegroundColor Green

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
