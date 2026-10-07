Add-Type -AssemblyName System.Drawing

$sizes = @(16, 48, 128)
$iconDir = "d:\PROJECT\lock-tab-extension\icons"

if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Background circle (Pure Black)
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(10, 10, 10))
    $g.FillEllipse($bgBrush, 0, 0, ($size - 1), ($size - 1))

    # Border (Subtle White Ring)
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 255, 255, 255), 1.0)
    $g.DrawEllipse($borderPen, 0.5, 0.5, ($size - 2), ($size - 2))
    
    # Padlock body (Pure White)
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $bodyW = [int]($size * 0.48)
    $bodyH = [int]($size * 0.38)
    $bodyX = [int](($size - $bodyW) / 2)
    $bodyY = [int]($size * 0.48)
    $g.FillRectangle($whiteBrush, $bodyX, $bodyY, $bodyW, $bodyH)

    # Padlock shackle loop
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, [Math]::Max(1.0, $size * 0.1))
    $shackleW = [int]($size * 0.30)
    $shackleH = [int]($size * 0.35)
    $shackleX = [int](($size - $shackleW) / 2)
    $shackleY = [int]($size * 0.22)
    $g.DrawArc($pen, $shackleX, $shackleY, $shackleW, $shackleH, 180, 180)

    $outPath = Join-Path $iconDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $pen.Dispose()
    $borderPen.Dispose()
    $whiteBrush.Dispose()
    $bgBrush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

Write-Output "Monochrome icons generated successfully."
