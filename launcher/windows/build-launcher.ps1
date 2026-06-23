param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDirectory "..\..")
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot "dist\windows-launcher"
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$compilerCandidates = @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$compiler = $compilerCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $compiler) {
  throw "The .NET Framework C# compiler was not found."
}

Add-Type -AssemblyName System.Drawing
$iconPath = Join-Path $OutputDirectory "timer-launcher.ico"
$bitmap = New-Object System.Drawing.Bitmap 64, 64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(17, 23, 34))
  $whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(244, 247, 251)), 5
  $cyanPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(73, 198, 229)), 5
  $yellowPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 200, 87)), 5
  try {
    $whitePen.StartCap = $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cyanPen.StartCap = $cyanPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $yellowPen.StartCap = $yellowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawEllipse($whitePen, 12, 16, 40, 40)
    $graphics.DrawLine($cyanPen, 32, 36, 32, 24)
    $graphics.DrawLine($cyanPen, 32, 36, 41, 30)
    $graphics.DrawLine($whitePen, 25, 9, 39, 9)
    $graphics.DrawLine($whitePen, 32, 9, 32, 15)
    $graphics.DrawLine($yellowPen, 44, 14, 50, 20)
    $centerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 87))
    try {
      $graphics.FillEllipse($centerBrush, 29, 33, 6, 6)
    }
    finally {
      $centerBrush.Dispose()
    }
  }
  finally {
    $whitePen.Dispose()
    $cyanPen.Dispose()
    $yellowPen.Dispose()
  }

  $pngStream = New-Object System.IO.MemoryStream
  try {
    $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $pngStream.ToArray()
    $file = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
    $writer = New-Object System.IO.BinaryWriter $file
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]1)
      $writer.Write([Byte]64)
      $writer.Write([Byte]64)
      $writer.Write([Byte]0)
      $writer.Write([Byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$png.Length)
      $writer.Write([UInt32]22)
      $writer.Write($png)
    }
    finally {
      $writer.Dispose()
      $file.Dispose()
    }
  }
  finally {
    $pngStream.Dispose()
  }
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

$source = Join-Path $scriptDirectory "FdvBoulderingTimerLauncher.cs"
$output = Join-Path $OutputDirectory "fdv-bouldering-timer.exe"
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 `
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll /win32icon:$iconPath /out:$output $source
if ($LASTEXITCODE -ne 0) {
  throw "Launcher compilation failed with exit code $LASTEXITCODE."
}

Remove-Item -LiteralPath $iconPath -Force
Write-Host "Windows launcher created: $output"
