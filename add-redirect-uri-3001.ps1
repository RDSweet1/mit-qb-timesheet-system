# Add localhost:3001 to Azure AD App Redirect URIs

$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"
$clientId = "973b689d-d96c-4445-883b-739fff12330b"
$clientSecret = "QVN8Q~iEZECKQhheQ_hPqpYR~pIJlWUZ3FtqGacs"

Write-Host "🔐 Getting Azure AD access token..." -ForegroundColor Cyan

# Get access token
$tokenBody = @{
    grant_type    = "client_credentials"
    client_id     = $clientId
    client_secret = $clientSecret
    scope         = "https://graph.microsoft.com/.default"
}

$tokenResponse = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" -Body $tokenBody
$accessToken = $tokenResponse.access_token

Write-Host "✅ Token obtained" -ForegroundColor Green
Write-Host ""

# Get current app configuration
Write-Host "📋 Getting current redirect URIs..." -ForegroundColor Cyan
$headers = @{
    Authorization = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$appUri = "https://graph.microsoft.com/v1.0/applications?`$filter=appId eq '$clientId'"
$app = Invoke-RestMethod -Method Get -Uri $appUri -Headers $headers
$appObjectId = $app.value[0].id

Write-Host "App Object ID: $appObjectId" -ForegroundColor Gray
Write-Host ""

# Get current redirect URIs
$currentApp = $app.value[0]
$webRedirectUris = $currentApp.web.redirectUris

Write-Host "Current redirect URIs:" -ForegroundColor Yellow
$webRedirectUris | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
Write-Host ""

# Add new redirect URI if not already present
$newRedirectUri = "http://localhost:3001"

if ($webRedirectUris -contains $newRedirectUri) {
    Write-Host "✅ http://localhost:3001 already configured!" -ForegroundColor Green
} else {
    Write-Host "➕ Adding http://localhost:3001..." -ForegroundColor Cyan

    # Add to existing array
    $updatedRedirectUris = $webRedirectUris + $newRedirectUri

    # Update app
    $updateBody = @{
        web = @{
            redirectUris = $updatedRedirectUris
        }
    } | ConvertTo-Json -Depth 10

    $updateUri = "https://graph.microsoft.com/v1.0/applications/$appObjectId"

    try {
        Invoke-RestMethod -Method Patch -Uri $updateUri -Headers $headers -Body $updateBody
        Write-Host "✅ Successfully added http://localhost:3001!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Updated redirect URIs:" -ForegroundColor Yellow
        $updatedRedirectUris | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    } catch {
        Write-Host "❌ Failed to update: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Configuration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now:" -ForegroundColor Cyan
Write-Host "  1. Open http://localhost:3001" -ForegroundColor White
Write-Host "  2. Click login" -ForegroundColor White
Write-Host "  3. Should redirect correctly to port 3001" -ForegroundColor White
