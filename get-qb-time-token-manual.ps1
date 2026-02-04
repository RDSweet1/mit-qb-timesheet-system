# Manual QB Time Token Exchange
$clientId = "ABnNKfjxSyDmpFKhNK1PbOCTFxv09Dc2MD5AJNLs8cFUQe0FPO"
$clientSecret = "NEsyhDb1g5nficOBremLWghqSyfwvOLIhkrSBLye"

Write-Host "`n=== QB TIME TOKEN EXCHANGE ===`n" -ForegroundColor Cyan

Write-Host "Paste the authorization code you copied from the URL:" -ForegroundColor Yellow
Write-Host "(Everything after 'code=' and before '&state')" -ForegroundColor Gray
Write-Host ""

$authCode = Read-Host "Authorization code"

if ([string]::IsNullOrWhiteSpace($authCode)) {
    Write-Host "`nERROR: No code provided!" -ForegroundColor Red
    exit
}

Write-Host "`nExchanging code for tokens..." -ForegroundColor Yellow

$tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
$redirectUri = "http://localhost:8000/callback"
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

    Write-Host "`n SUCCESS! Got QB Time Tokens!`n" -ForegroundColor Green

    Write-Host "Access Token (first 50 chars):" -ForegroundColor Cyan
    Write-Host $response.access_token.Substring(0, [Math]::Min(50, $response.access_token.Length))... -ForegroundColor Gray

    Write-Host "`nRefresh Token (first 30 chars):" -ForegroundColor Cyan
    Write-Host $response.refresh_token.Substring(0, [Math]::Min(30, $response.refresh_token.Length))... -ForegroundColor Gray

    # Save to file
    $tokenFile = "qb-time-tokens.txt"
    @"
# QuickBooks Time OAuth Tokens
# Generated: $(Get-Date)

QB_TIME_ACCESS_TOKEN=$($response.access_token)
QB_TIME_REFRESH_TOKEN=$($response.refresh_token)

# Add these to Supabase:
# https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/functions
"@ | Out-File $tokenFile

    Write-Host "`n Tokens saved to: $tokenFile" -ForegroundColor Green
    Write-Host "`nNext step: Add QB_TIME_ACCESS_TOKEN to Supabase secrets" -ForegroundColor Yellow

    # Also save to .env for reference
    $envLine = "`n# QuickBooks Time (added $(Get-Date))`nQB_TIME_ACCESS_TOKEN=$($response.access_token)`nQB_TIME_REFRESH_TOKEN=$($response.refresh_token)"
    Add-Content .env $envLine
    Write-Host "Also added to .env file" -ForegroundColor Gray

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nMake sure you:" -ForegroundColor Yellow
    Write-Host "1. Copied the FULL code from the URL" -ForegroundColor Gray
    Write-Host "2. The code hasn't expired (use it within 10 minutes)" -ForegroundColor Gray
    Write-Host "3. Haven't used this code already (codes are single-use)" -ForegroundColor Gray
}

Write-Host ""
