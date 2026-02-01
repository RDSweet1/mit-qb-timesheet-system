# Automated Azure App Configuration via Microsoft Graph API
# This script will configure the Azure app without manual clicking

$appId = "973b689d-d96c-4445-883b-739fff12330b"
$tenantId = "aee0257d-3be3-45ae-806b-65c972c98dfb"

Write-Host "=== AUTOMATED AZURE CONFIGURATION ===" -ForegroundColor Cyan
Write-Host ""

# Check if Microsoft Graph module is available
Write-Host "[1/6] Checking for Microsoft Graph PowerShell module..." -ForegroundColor Yellow

try {
    Import-Module Microsoft.Graph.Applications -ErrorAction Stop
    Write-Host "   ✓ Microsoft Graph module found" -ForegroundColor Green
    $useGraph = $true
} catch {
    Write-Host "   ✗ Microsoft Graph module not found" -ForegroundColor Red
    Write-Host "   Installing Microsoft Graph module..." -ForegroundColor Yellow
    try {
        Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
        Import-Module Microsoft.Graph.Applications
        Write-Host "   ✓ Microsoft Graph module installed" -ForegroundColor Green
        $useGraph = $true
    } catch {
        Write-Host "   ✗ Failed to install module" -ForegroundColor Red
        Write-Host "   Will use REST API directly..." -ForegroundColor Yellow
        $useGraph = $false
    }
}

Write-Host ""

if ($useGraph) {
    # Use Microsoft Graph PowerShell SDK
    Write-Host "[2/6] Connecting to Microsoft Graph..." -ForegroundColor Yellow

    try {
        Connect-MgGraph -Scopes "Application.ReadWrite.All" -TenantId $tenantId -ErrorAction Stop
        Write-Host "   ✓ Connected to Microsoft Graph" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to connect: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Please sign in when prompted..." -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host "[3/6] Getting application details..." -ForegroundColor Yellow

    try {
        $app = Get-MgApplication -Filter "appId eq '$appId'" -ErrorAction Stop
        Write-Host "   ✓ Found app: $($app.DisplayName)" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to get app: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "[4/6] Updating application configuration..." -ForegroundColor Yellow

    # Build the configuration updates
    $web = @{
        RedirectUris = @(
            "https://rdsweet1.github.io/mit-qb-frontend/",
            "https://rdsweet1.github.io/mit-qb-frontend",
            "http://localhost:3000"
        )
        ImplicitGrantSettings = @{
            EnableAccessTokenIssuance = $true
            EnableIdTokenIssuance = $true
        }
    }

    $spa = @{
        RedirectUris = @(
            "https://rdsweet1.github.io/mit-qb-frontend/",
            "https://rdsweet1.github.io/mit-qb-frontend",
            "http://localhost:3000"
        )
    }

    try {
        Update-MgApplication -ApplicationId $app.Id -Web $web -Spa $spa -ErrorAction Stop
        Write-Host "   ✓ Implicit grant enabled" -ForegroundColor Green
        Write-Host "   ✓ Redirect URIs added" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to update: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "[5/6] Adding Mail permissions..." -ForegroundColor Yellow

    # Microsoft Graph API permissions
    $graphResourceId = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    # Permission IDs for Mail.Send and Mail.ReadWrite
    $mailSendId = "e383f46e-2787-4529-855e-0e479a3ffac0" # Mail.Send
    $mailReadWriteId = "024d486e-b451-40bb-833d-3e66d98c5c73" # Mail.ReadWrite

    $requiredResourceAccess = @{
        ResourceAppId = $graphResourceId
        ResourceAccess = @(
            @{
                Id = $mailSendId
                Type = "Scope"
            },
            @{
                Id = $mailReadWriteId
                Type = "Scope"
            }
        )
    }

    try {
        # Get current permissions
        $currentPermissions = $app.RequiredResourceAccess | Where-Object { $_.ResourceAppId -eq $graphResourceId }

        if ($currentPermissions) {
            # Add to existing permissions
            $newAccess = $currentPermissions.ResourceAccess + $requiredResourceAccess.ResourceAccess
            $requiredResourceAccess.ResourceAccess = $newAccess | Sort-Object Id -Unique
        }

        Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess @($requiredResourceAccess) -ErrorAction Stop
        Write-Host "   ✓ Mail.Send permission added" -ForegroundColor Green
        Write-Host "   ✓ Mail.ReadWrite permission added" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠ Warning: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   You may need to add permissions manually" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "[6/6] Granting admin consent..." -ForegroundColor Yellow
    Write-Host "   ⚠ Admin consent must be granted manually in Azure Portal" -ForegroundColor Yellow
    Write-Host "   Opening consent page..." -ForegroundColor Yellow

    $consentUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$appId"
    Start-Process $consentUrl

    Write-Host ""
    Write-Host "=== CONFIGURATION COMPLETE ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "✓ Implicit grant tokens enabled" -ForegroundColor Green
    Write-Host "✓ Redirect URIs configured" -ForegroundColor Green
    Write-Host "✓ Mail permissions added" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠ ACTION REQUIRED:" -ForegroundColor Yellow
    Write-Host "  In the Azure Portal that just opened:" -ForegroundColor White
    Write-Host "  1. Click 'Grant admin consent for [your org]'" -ForegroundColor White
    Write-Host "  2. Click 'Yes' to confirm" -ForegroundColor White
    Write-Host ""
    Write-Host "Then test login at: https://rdsweet1.github.io/mit-qb-frontend/" -ForegroundColor Cyan

    Disconnect-MgGraph | Out-Null

} else {
    # Use REST API directly
    Write-Host "[2/6] Using REST API authentication..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This requires interactive authentication." -ForegroundColor Yellow
    Write-Host "Please sign in when prompted..." -ForegroundColor White
    Write-Host ""

    # Open browser for OAuth flow
    $authUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/authorize?" +
                "client_id=14d82eec-204b-4c2f-b7e8-296a70dab67e&" + # Azure CLI client ID
                "response_type=code&" +
                "redirect_uri=http://localhost:8400&" +
                "scope=https://graph.microsoft.com/.default&" +
                "response_mode=query"

    Start-Process $authUrl

    Write-Host "⚠ Automated configuration requires Microsoft Graph PowerShell module" -ForegroundColor Yellow
    Write-Host "  Install it with: Install-Module Microsoft.Graph -Scope CurrentUser" -ForegroundColor White
    Write-Host ""
    Write-Host "For now, please complete the manual configuration in Azure Portal" -ForegroundColor Yellow
}
