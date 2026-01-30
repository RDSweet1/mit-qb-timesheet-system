@echo off
echo ========================================
echo Deploying Edge Functions to Supabase
echo ========================================
echo.

set SUPABASE_ACCESS_TOKEN=sbp_c0133df1e3a3152c6e50103dd1159df921d85909
set PROJECT_REF=migcpasmtbdojqphqyzc

cd /d "%~dp0"

echo [1/5] Linking to project...
call npx supabase link --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to link to project
    pause
    exit /b 1
)

echo.
echo [2/5] Deploying sync-service-items...
call npx supabase functions deploy sync-service-items --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy sync-service-items
    pause
    exit /b 1
)

echo.
echo [3/5] Deploying qb-time-sync...
call npx supabase functions deploy qb-time-sync --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy qb-time-sync
    pause
    exit /b 1
)

echo.
echo [4/5] Deploying send-reminder...
call npx supabase functions deploy send-reminder --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy send-reminder
    pause
    exit /b 1
)

echo.
echo [5/5] Deploying create-invoices...
call npx supabase functions deploy create-invoices --project-ref %PROJECT_REF%
if errorlevel 1 (
    echo ERROR: Failed to deploy create-invoices
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! All functions deployed
echo ========================================
echo.
echo Now setting environment secrets...
echo.

call npx supabase secrets set QB_CLIENT_ID=ABamrQ0DrZsT17YbpEqe0ugmASANFNBDezesowFZslRLsTqf0a --project-ref %PROJECT_REF%
call npx supabase secrets set QB_CLIENT_SECRET=O5bC84D6U1OGgqrx7oQ4pga51XImj8aqptntvfxU --project-ref %PROJECT_REF%
call npx supabase secrets set QB_REALM_ID=9341456256329564 --project-ref %PROJECT_REF%
call npx supabase secrets set QB_ENVIRONMENT=sandbox --project-ref %PROJECT_REF%
call npx supabase secrets set AZURE_TENANT_ID=aee0257d-3be3-45ae-806b-65c972c98dfb --project-ref %PROJECT_REF%
call npx supabase secrets set AZURE_CLIENT_ID=973b689d-d96c-4445-883b-739fff12330b --project-ref %PROJECT_REF%
call npx supabase secrets set AZURE_CLIENT_SECRET=YOUR_AZURE_CLIENT_SECRET_HERE --project-ref %PROJECT_REF%
call npx supabase secrets set QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..ImuEB5Zem2v7mQWmDi0L7g.DoT62xGqG8S7VQqVaZGBEK_kfrQpXDPxs_RUQa2-1P922z-H8PKEdS2sgxM34T4gINMZVSStmqpJBFC91hCkHXAtj1jVDhPQaV96CayA04PzCx7FzhLprBmPMo9HMOp8nLGcjoxiBfjTsASL9mpgCs3r_3JDVPL8UtuJqGBnvgQPIwS4VrOY7i-Lk0TDTiele4R2w9Le8Fl4Y9qQqZckrRkkHg6hT1UmDzqU1GX2lU8BwT8S-sItscveJDKhCtHR-2qEuVUN9LwpYWqVXde8LxEgQTiKl6WuOylbv1I56C8r9Vin9iaSOw8EJ5tm4TBiMA9xJ4kIKPdLeY_AyqkAS24fr3FIcHewzLBnjLw1w_n101c5mAVWt-efm0ktfqNsC-1TvF_3jDWlPhrJJm1nqkOQb61DFDLJDAlYpg4tuBEhjYAyCwiAmG-PTiqLz57HdNDtoSlb0wo9Hxc65ns2zJ8MLf02ULs5xQMyBODy5q_OYMAa4QO45DAASMxLLwVRdzS-28nj5s3qRwcFy3740-MDILVrExlv9FF3uA_-8AH_Qy7wwC9DJOrzyOCFCC0_lKr_qCvMmNPeNdD7Aj1h7Ib6HPBnt-5-7z6UGFhWHAeCc1ESM0mX5efYmL-HT7b6.a9Bd4B1oB4fStEkazhZ6-Q --project-ref %PROJECT_REF%
call npx supabase secrets set QB_REFRESH_TOKEN=RT1-222-IIb-17784204R0vt2sAmsl8ncvdklSa3zw --project-ref %PROJECT_REF%

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Your Edge Functions are now live at:
echo - https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/sync-service-items
echo - https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync
echo - https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/send-reminder
echo - https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/create-invoices
echo.
pause
