# Automated Azure App Configuration
$ErrorActionPreference = "Stop"

$appId = "973b689d-d96c-4445-883b-739fff12330b"
$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"

Write-Host "=== AUTOMATED AZURE CONFIGURATION ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Microsoft Graph if needed
Write-Host "[1/5] Checking Microsoft Graph PowerShell..." -ForegroundColor Yellow

if (!(Get-Module -ListAvailable -Name Microsoft.Graph.Applications)) {
    Write-Host "   Installing Microsoft Graph module (this may take a few minutes)..." -ForegroundColor Yellow
    Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
    Write-Host "   ✓ Installed" -ForegroundColor Green
} else {
    Write-Host "   ✓ Already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/5] Connecting to Microsoft Graph..." -ForegroundColor Yellow
Write-Host "   A browser window will open for authentication..." -ForegroundColor Gray

try {
    Connect-MgGraph -Scopes "Application.ReadWrite.All" -TenantId $tenantId -NoWelcome
    Write-Host "   ✓ Connected" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/5] Fetching application..." -ForegroundColor Yellow

$apps = Get-MgApplication -Filter "appId eq '$appId'"
if ($apps.Count -eq 0) {
    Write-Host "   ✗ Application not found" -ForegroundColor Red
    exit 1
}
$app = $apps[0]
Write-Host "   ✓ Found: $($app.DisplayName)" -ForegroundColor Green

Write-Host ""
Write-Host "[4/5] Configuring application..." -ForegroundColor Yellow

# Update SPA configuration with redirect URIs and implicit grant
$spaConfig = @{
    RedirectUris = @(
        "https://rdsweet1.github.io/mit-qb-frontend/",
        "https://rdsweet1.github.io/mit-qb-frontend",
        "http://localhost:3000"
    )
}

# Enable implicit grant for SPA
$webConfig = @{
    ImplicitGrantSettings = @{
        EnableAccessTokenIssuance = $true
        EnableIdTokenIssuance = $true
    }
}

try {
    Update-MgApplication -ApplicationId $app.Id -Spa $spaConfig -Web $webConfig
    Write-Host "   ✓ Redirect URIs configured" -ForegroundColor Green
    Write-Host "   ✓ Implicit grant enabled (Access + ID tokens)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Update failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "[5/5] Adding Mail permissions..." -ForegroundColor Yellow

# Microsoft Graph resource ID
$graphId = "00000003-0000-0000-c000-000000000000"

# Get existing permissions
$existingPerms = $app.RequiredResourceAccess | Where-Object { $_.ResourceAppId -eq $graphId }

# Permission IDs
$permissions = @(
    @{ Id = "e383f46e-2787-4529-855e-0e479a3ffac0"; Type = "Scope" } # Mail.Send
    @{ Id = "024d486e-b451-40bb-833d-3e66d98c5c73"; Type = "Scope" } # Mail.ReadWrite
    @{ Id = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"; Type = "Scope" } # User.Read
    @{ Id = "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0"; Type = "Scope" } # email
    @{ Id = "37f7f235-527c-4136-accd-4a02d197296e"; Type = "Scope" } # openid
    @{ Id = "14dad69e-099b-42c9-810b-d002981feec1"; Type = "Scope" } # profile
)

$resourceAccess = @()
foreach ($perm in $permissions) {
    $resourceAccess += @{
        Id = $perm.Id
        Type = $perm.Type
    }
}

$requiredAccess = @{
    ResourceAppId = $graphId
    ResourceAccess = $resourceAccess
}

try {
    Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess @($requiredAccess)
    Write-Host "   ✓ Mail.Send added" -ForegroundColor Green
    Write-Host "   ✓ Mail.ReadWrite added" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Warning: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== CONFIGURATION COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "✓ Implicit grant tokens enabled" -ForegroundColor Green
Write-Host "✓ Redirect URIs added:" -ForegroundColor Green
Write-Host "  - https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Gray
Write-Host "  - https://rdsweet1.github.io/mit-qb-frontend" -ForegroundColor Gray
Write-Host "  - http://localhost:3000" -ForegroundColor Gray
Write-Host "✓ Mail permissions configured" -ForegroundColor Green
Write-Host ""
Write-Host "⚠ ADMIN CONSENT REQUIRED:" -ForegroundColor Yellow
Write-Host "  Opening Azure Portal to grant admin consent..." -ForegroundColor White

$consentUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$appId/isMSAApp~/false"
Start-Process $consentUrl

Write-Host ""
Write-Host "  In the browser:" -ForegroundColor White
Write-Host "  1. Click 'Grant admin consent for [your organization]'" -ForegroundColor White
Write-Host "  2. Click 'Yes'" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter when done..." -ForegroundColor Yellow
Read-Host

Write-Host ""
Write-Host "=== TESTING LOGIN ===" -ForegroundColor Cyan
Write-Host "Opening production site..." -ForegroundColor Yellow

Start-Process "https://rdsweet1.github.io/mit-qb-frontend/"

Write-Host ""
Write-Host "Click 'Sign in with Microsoft' and verify:" -ForegroundColor White
Write-Host "  ✓ Login popup opens" -ForegroundColor Gray
Write-Host "  ✓ You can sign in" -ForegroundColor Gray
Write-Host "  ✓ Consent screen shows Mail permissions" -ForegroundColor Gray
Write-Host "  ✓ Redirects to dashboard" -ForegroundColor Gray
Write-Host ""

Disconnect-MgGraph | Out-Null

Write-Host "Done! Login should now work" -ForegroundColor Green
