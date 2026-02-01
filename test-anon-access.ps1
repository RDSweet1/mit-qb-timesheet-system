Write-Host "Testing anonymous read access..." -ForegroundColor Cyan
Write-Host ""

$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"

# Test 1: Count
$count = Invoke-RestMethod `
    -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/service_items?select=count" `
    -Headers @{"apikey"=$apikey; "Prefer"="count=exact"}

Write-Host "Total service items readable by anon: $($count[0].count)" -ForegroundColor Green
Write-Host ""

# Test 2: Sample data
Write-Host "Sample items:" -ForegroundColor Cyan
$items = Invoke-RestMethod `
    -Uri "https://migcpasmtbdojqphqyzc.supabase.co/rest/v1/service_items?limit=5&select=name,unit_price&order=unit_price.desc" `
    -Headers @{"apikey"=$apikey}

$items | Format-Table -AutoSize

Write-Host ""
Write-Host "SUCCESS! Database is working and accessible!" -ForegroundColor Green
