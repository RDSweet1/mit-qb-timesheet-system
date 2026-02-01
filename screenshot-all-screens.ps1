Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Get all screens
$screens = [System.Windows.Forms.Screen]::AllScreens

Write-Host "Found $($screens.Count) screen(s)" -ForegroundColor Cyan

for ($i = 0; $i -lt $screens.Count; $i++) {
    $screen = $screens[$i]
    $bounds = $screen.Bounds

    Write-Host "Capturing Screen $($i + 1): $($bounds.Width)x$($bounds.Height) at ($($bounds.X), $($bounds.Y))" -ForegroundColor Yellow

    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

    $filename = "C:\SourceCode\WeeklyTimeBillingQB\screenshot-screen-$($i + 1).png"
    $bitmap.Save($filename)

    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Host "   Saved: $filename" -ForegroundColor Green
}

Write-Host ""
Write-Host "All screenshots captured!" -ForegroundColor Green
