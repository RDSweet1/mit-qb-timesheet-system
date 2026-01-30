@echo off
echo ========================================
echo Deploying OAuth Pages to Vercel
echo ========================================
echo.

cd /d "%~dp0oauth-pages"

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
echo Deploying to Vercel...
echo ========================================
echo.
echo You may need to login to Vercel first.
echo If prompted, follow the login instructions.
echo.

call npx vercel --prod --yes

if errorlevel 1 (
    echo.
    echo ========================================
    echo Deployment Failed
    echo ========================================
    echo.
    echo Try these steps:
    echo 1. Login first: vercel login
    echo 2. Then deploy: vercel --prod
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! OAuth Pages Deployed
echo ========================================
echo.
echo Your production URLs are shown above.
echo.
echo Copy them into the QuickBooks Developer Portal:
echo.
echo 1. Host Domain: [your-domain].vercel.app
echo 2. EULA URL: https://[your-domain].vercel.app/eula
echo 3. Privacy Policy: https://[your-domain].vercel.app/eula
echo 4. Launch URL: https://[your-domain].vercel.app/connect
echo 5. Disconnect URL: https://[your-domain].vercel.app/disconnect
echo.
echo ========================================
echo.
pause
