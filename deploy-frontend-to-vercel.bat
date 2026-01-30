@echo off
echo ========================================
echo Deploying Frontend to Vercel
echo ========================================
echo.

cd /d "%~dp0frontend"

echo Checking if Vercel CLI is installed...
call npx vercel --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo Vercel CLI not found. Installing...
    call npm install -g vercel
    if errorlevel 1 (
        echo ERROR: Failed to install Vercel CLI
        echo.
        echo Please install manually:
        echo   npm install -g vercel
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo IMPORTANT: Environment Variables Setup
echo ========================================
echo.
echo Before deploying, you need to set up environment variables in Vercel.
echo.
echo Required variables:
echo   1. NEXT_PUBLIC_SUPABASE_URL
echo   2. NEXT_PUBLIC_SUPABASE_ANON_KEY
echo   3. NEXT_PUBLIC_AZURE_CLIENT_ID
echo   4. NEXT_PUBLIC_AZURE_TENANT_ID
echo   5. NEXT_PUBLIC_REDIRECT_URI (will be your Vercel URL)
echo.
echo You can set these after deployment in Vercel Dashboard.
echo.
pause

echo.
echo ========================================
echo Step 1: Login to Vercel
echo ========================================
echo.
echo If you're not logged in, a browser window will open.
echo Follow the prompts to authenticate.
echo.
call npx vercel login

if errorlevel 1 (
    echo ERROR: Failed to login to Vercel
    pause
    exit /b 1
)

echo.
echo ========================================
echo Step 2: Deploy to Production
echo ========================================
echo.
echo Deploying frontend to Vercel...
echo This may take a few minutes...
echo.

call npx vercel --prod --yes

if errorlevel 1 (
    echo.
    echo ========================================
    echo Deployment Failed
    echo ========================================
    echo.
    echo Try these steps:
    echo 1. Check your internet connection
    echo 2. Verify you're logged in: vercel whoami
    echo 3. Try deploying manually: cd frontend && vercel --prod
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Frontend Deployed
echo ========================================
echo.
echo Your production URL is shown above.
echo.
echo ========================================
echo NEXT STEPS - IMPORTANT!
echo ========================================
echo.
echo 1. COPY YOUR VERCEL URL (e.g., https://mit-qb-timesheet.vercel.app)
echo.
echo 2. SET ENVIRONMENT VARIABLES in Vercel Dashboard:
echo    - Go to: https://vercel.com/dashboard
echo    - Select your project
echo    - Go to Settings ^> Environment Variables
echo    - Add the following variables:
echo.
echo    NEXT_PUBLIC_SUPABASE_URL=https://migcpasmtbdojqphqyzc.supabase.co
echo    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ
echo    NEXT_PUBLIC_AZURE_CLIENT_ID=(your Azure app client ID)
echo    NEXT_PUBLIC_AZURE_TENANT_ID=(your Azure tenant ID)
echo    NEXT_PUBLIC_REDIRECT_URI=(your Vercel URL)
echo.
echo 3. REDEPLOY after setting variables:
echo    vercel --prod
echo.
echo 4. UPDATE AZURE AD REDIRECT URI:
echo    - Go to: https://portal.azure.com
echo    - Navigate to Azure AD ^> App registrations
echo    - Select your app
echo    - Add Redirect URI: (your Vercel URL)
echo.
echo ========================================
echo.
pause
