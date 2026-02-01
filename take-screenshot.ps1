Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('C:\SourceCode\WeeklyTimeBillingQB\screenshot-login-error.png')
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Screenshot saved to: C:\SourceCode\WeeklyTimeBillingQB\screenshot-login-error.png"
