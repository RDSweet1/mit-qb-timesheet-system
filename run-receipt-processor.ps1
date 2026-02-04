# Receipt Processor Runner
# Run this script every 10 minutes via Windows Task Scheduler
# Schedule: Task Scheduler > Create Basic Task > Trigger: Daily, Repeat every 10 minutes

$url = "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/process_email_receipts"
$anonKey = $env:SUPABASE_ANON_KEY

if (-not $anonKey) {
    # Load from .env if not in environment
    $envFile = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^SUPABASE_ANON_KEY=(.+)$') {
                $anonKey = $matches[1]
            }
        }
    }
}

Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Processing email receipts..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers @{
        "Authorization" = "Bearer $anonKey"
        "Content-Type" = "application/json"
    } -TimeoutSec 30

    if ($response.success) {
        Write-Host "✅ Processed: $($response.processed.total) receipts" -ForegroundColor Green
        Write-Host "   - Delivery: $($response.processed.delivery)" -ForegroundColor White
        Write-Host "   - Read: $($response.processed.read)" -ForegroundColor White
        Write-Host "   - Declined: $($response.processed.declined)" -ForegroundColor White
        Write-Host "   - Scanned: $($response.messagesScanned) messages" -ForegroundColor White
    } else {
        Write-Host "❌ Error: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to process receipts: $($_.Exception.Message)" -ForegroundColor Red
}

# Log to file
$logFile = Join-Path $PSScriptRoot "receipt-processor.log"
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Processed: $($response.processed.total) receipts" | Out-File -FilePath $logFile -Append
