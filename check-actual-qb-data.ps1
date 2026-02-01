# Check what QB actually returned for a time entry
$projectRef = "migcpasmtbdojqphqyzc"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5OTcyNiwiZXhwIjoyMDg1Mjc1NzI2fQ.gJQQMGjqhNDJHiND3SF00d2sBIw0ErA710GWdxVto-E"

Write-Host "`n=== CHECKING YOUR ACTUAL QB DATA ===`n" -ForegroundColor Cyan

# Get one entry that was just synced (should be most recent)
$query = "select=employee_name,txn_date,start_time,end_time,hours,minutes,synced_at&order=synced_at.desc&limit=3"

Write-Host "Querying most recently synced entries..." -ForegroundColor Yellow

$response = Invoke-RestMethod `
    -Uri "https://$projectRef.supabase.co/rest/v1/time_entries?$query" `
    -Headers @{
        "apikey" = $serviceKey
        "Authorization" = "Bearer $serviceKey"
    }

Write-Host "`nMost Recent Entries from QB:" -ForegroundColor Green
$response | ForEach-Object {
    Write-Host "`n----------------------------------------" -ForegroundColor Gray
    Write-Host "Employee: $($_.employee_name)" -ForegroundColor White
    Write-Host "Date: $($_.txn_date)" -ForegroundColor White
    Write-Host "Start Time: $($_.start_time)" -ForegroundColor $(if ($_.start_time) { "Green" } else { "Red" })
    Write-Host "End Time: $($_.end_time)" -ForegroundColor $(if ($_.end_time) { "Green" } else { "Red" })
    Write-Host "Duration: $($_.hours)h $($_.minutes)m" -ForegroundColor White
    Write-Host "Synced: $($_.synced_at)" -ForegroundColor Gray
}

Write-Host "`n`n=== ANALYSIS ===`n" -ForegroundColor Cyan

$withTimes = $response | Where-Object { $_.start_time -ne $null -and $_.start_time -ne "" }
$withoutTimes = $response | Where-Object { $_.start_time -eq $null -or $_.start_time -eq "" }

Write-Host "Entries WITH start/end times: $($withTimes.Count)" -ForegroundColor $(if ($withTimes.Count -gt 0) { "Green" } else { "Yellow" })
Write-Host "Entries WITHOUT start/end times (lump sum): $($withoutTimes.Count)" -ForegroundColor Yellow

if ($withTimes.Count -eq 0) {
    Write-Host "`n RESULT: QB Online API is NOT returning start/end times" -ForegroundColor Red
    Write-Host "`nThis confirms that even though Workforce creates clock entries," -ForegroundColor Yellow
    Write-Host "the QB Online TimeActivity API doesn't expose the times." -ForegroundColor Yellow
    Write-Host "`nSOLUTION: Need to use QuickBooks Time API instead." -ForegroundColor Cyan
} else {
    Write-Host "`n RESULT: QB Online API DOES return start/end times!" -ForegroundColor Green
    Write-Host "The sync is working correctly for entries with times." -ForegroundColor Green
}

Write-Host ""
