# Test database insert directly
$testData = @{
    qb_item_id = "TEST-123"
    name = "Test Item"
    unit_price = 100
} | ConvertTo-Json

Write-Host "Testing direct database insert..."
Write-Host "Data: $testData"
Write-Host ""

try {
    $result = Invoke-RestMethod `
        -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/service_items" `
        -Method POST `
        -Headers @{
            "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"
            "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"
            "Content-Type" = "application/json"
            "Prefer" = "return=representation"
        } `
        -Body $testData

    Write-Host "SUCCESS! Inserted:" -ForegroundColor Green
    $result | ConvertTo-Json

} catch {
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host ""
Write-Host "Checking database count..."
$count = Invoke-RestMethod `
    -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/service_items?select=count" `
    -Headers @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"
        "Prefer" = "count=exact"
    }

Write-Host "Total records in database: $($count[0].count)"
