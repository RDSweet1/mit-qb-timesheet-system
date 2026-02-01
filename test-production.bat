@echo off
echo.
echo ================================================
echo   Testing QuickBooks Production Connection
echo ================================================
echo.

echo [1/3] Testing sync-service-items function...
curl -X POST "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/sync-service-items" ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ" ^
  -H "Content-Type: application/json" ^
  -d "{}"

echo.
echo.
echo [2/3] Checking service_items table...
curl "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/service_items?limit=5" ^
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

echo.
echo.
echo ================================================
echo   Test Complete!
echo ================================================
echo.
pause
