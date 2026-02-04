# Find a free port for OAuth redirect
Write-Host "`nFinding free port for OAuth...`n" -ForegroundColor Cyan

# Try ports in high range (less likely to conflict)
$portsToTry = @(52847, 52848, 52849, 53000, 53001, 54000, 55000)

foreach ($port in $portsToTry) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $listener.Start()
        $listener.Stop()

        Write-Host " PORT $port is FREE and available!" -ForegroundColor Green
        Write-Host "`nRecommended Redirect URI:" -ForegroundColor Cyan
        Write-Host "http://localhost:$port/callback" -ForegroundColor Yellow
        Write-Host "`nAdd this to your QuickBooks app in Intuit Developer Portal" -ForegroundColor Gray

        # Save for later use
        $port | Out-File "oauth-port.txt"

        break
    } catch {
        Write-Host "Port $port is in use, trying next..." -ForegroundColor Gray
    }
}

Write-Host ""
