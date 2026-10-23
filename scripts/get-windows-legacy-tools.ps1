param(
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [ValidateSet('x86','x64')][string]$Architecture = 'x64'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
function DownloadText([string]$Url) {
  $result = (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 60).Content
  if ($result -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($result).Trim() }
  return $result.Trim()
}
$nodeVersion = '12.22.12'
$archiveName = "node-v$nodeVersion-win-$Architecture.zip"
$hashes = DownloadText "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt"
$checksumLine = @($hashes -split '\r?\n' | Where-Object { $_ -match ('\s+' + [regex]::Escape($archiveName) + '$') })
if ($checksumLine.Count -ne 1) { throw 'Missing official Node archive checksum' }
$expected = ($checksumLine[0] -split '\s+')[0]
$archive = Join-Path $OutputDirectory $archiveName
if (!(Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile $archive -TimeoutSec 180
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash -ne $expected) { throw 'Node archive checksum mismatch' }
$nodeRoot = Join-Path $OutputDirectory "node-v$nodeVersion-win-$Architecture"
if (!(Test-Path -LiteralPath $nodeRoot)) { Expand-Archive -LiteralPath $archive -DestinationPath $OutputDirectory }
$binaryLine = @($hashes -split '\r?\n' | Where-Object { $_ -match ('\s+win-' + $Architecture + '/node.exe$') })
if ($binaryLine.Count -ne 1 -or (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $nodeRoot 'node.exe')).Hash -ne ($binaryLine[0] -split '\s+')[0]) {
  throw 'Extracted Node binary checksum mismatch'
}
$referenceUrl = 'https://api.nuget.org/v3-flatcontainer/microsoft.netframework.referenceassemblies.net20/1.0.3/microsoft.netframework.referenceassemblies.net20.1.0.3.nupkg'
$referenceZip = Join-Path $OutputDirectory 'net20.zip'
if (!(Test-Path -LiteralPath $referenceZip)) {
  Invoke-WebRequest -UseBasicParsing -Uri $referenceUrl -OutFile $referenceZip -TimeoutSec 180
}
# SHA512 from NuGet's versioned package metadata (PackageHash), pinned here.
$expectedReference = 'M1vB2xSMJY0FdXNSUH4kjj04aTqWIOPUKeUUfaCoVA5JVw30XGO9ID7mUuBo+inSXLgmLvoMkSb3d98YEQwfyA=='
$actualReference = [Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash([System.IO.File]::ReadAllBytes($referenceZip)))
if ($actualReference -cne $expectedReference) { throw '.NET reference archive checksum mismatch' }
$referenceRoot = Join-Path $OutputDirectory 'net20'
if (!(Test-Path -LiteralPath $referenceRoot)) { Expand-Archive -LiteralPath $referenceZip -DestinationPath $referenceRoot }
Write-Host "Verified official Node $nodeVersion $Architecture and Microsoft .NET2 reference assemblies."
