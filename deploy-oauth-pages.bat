@echo off
echo ========================================
echo Deploying QuickBooks OAuth Pages
echo (Required for Production App Approval)
echo ========================================
echo.

set SUPABASE_ACCESS_TOKEN=sbp_c0133df1e3a3152c6e50103dd1159df921d85909
set PROJECT_REF=migcpasmtbdojqphqyzc

cd /d "%~dp0"

echo [1/4] Linking to project...
call npx supabase link --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to link to project
    pause
    exit /b 1
)

echo.
echo [2/4] Deploying EULA page (PUBLIC ACCESS)...
call npx supabase functions deploy eula --no-verify-jwt --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy eula
    pause
    exit /b 1
)

echo.
echo [3/4] Deploying Connect QuickBooks (PUBLIC ACCESS - Launch URL)...
call npx supabase functions deploy connect-qb --no-verify-jwt --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy connect-qb
    pause
    exit /b 1
)

echo.
echo [4/4] Deploying Disconnect QuickBooks (PUBLIC ACCESS)...
call npx supabase functions deploy disconnect-qb --no-verify-jwt --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy disconnect-qb
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! OAuth Pages Deployed
echo ========================================
echo.
echo Your QuickBooks OAuth URLs are:
echo.
echo EULA / Privacy Policy:
echo https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/eula
echo.
echo Launch URL:
echo https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/connect-qb
echo.
echo Disconnect URL:
echo https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/disconnect-qb
echo.
echo ========================================
echo NEXT STEP: Submit Production App Form
echo ========================================
echo.
echo Copy these URLs into the Intuit Developer portal:
echo 1. Go to: https://developer.intuit.com/app/developer/myapps
echo 2. Select your app
echo 3. Go to Production Settings
echo 4. Fill in the URLs above
echo 5. Complete the App Assessment Questionnaire
echo.
pause
