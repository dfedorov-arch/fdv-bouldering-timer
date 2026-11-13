param(
    [Parameter(Mandatory=$true)][string]$PayloadDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [ValidateSet('x86','x64')][string]$Architecture='x64',
    [switch]$Legacy
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$payload=(Resolve-Path -LiteralPath $PayloadDirectory).Path
$output=[IO.Path]::GetFullPath($OutputDirectory)
foreach($part in @(@{value=([version]$Version).Major;max=255},@{value=([version]$Version).Minor;max=255},@{value=([version]$Version).Build;max=65535})){
    if($part.value -gt $part.max){throw 'Version is outside Windows Installer limits'}
}
if(!$Legacy -and $Architecture -ne 'x64'){throw 'The modern Windows MSI supports x64 only'}
foreach($file in @('fdv-bouldering-timer.exe','runtime/win/node.exe','serve-bouldering-timer.js','params.txt')){
    if(!(Test-Path -LiteralPath (Join-Path $payload $file) -PathType Leaf)){throw "Missing MSI payload file: $file"}
}
$node=Join-Path $payload 'runtime/win/node.exe'
$runtime=& $node -p "process.versions.node + ':' + process.arch"
if($LASTEXITCODE -ne 0){throw 'Cannot verify the bundled runtime'}
$expectedArch=if($Architecture -eq 'x86'){'ia32'}else{'x64'}
if($Legacy){
    if($runtime -ne "12.22.12:$expectedArch"){throw "Legacy MSI requires Node12.22.12/$expectedArch, received $runtime"}
    if(!(Test-Path -LiteralPath (Join-Path $payload 'fdv-bouldering-timer.exe.config'))){throw 'Missing CLR2/CLR4 launcher configuration'}
}elseif($runtime -notmatch '^([2-9][0-9])\.[0-9]+\.[0-9]+:x64$'){throw "Modern MSI requires a modern x64 runtime, received $runtime"}
foreach($name in @('runtime-state','https','fdv-installed.marker','timer-cert.pfx','timer-key.pem')){
    if(Test-Path -LiteralPath (Join-Path $payload $name)){throw "Portable payload contains generated/installed data: $name"}
}
$variant=if($Legacy){'windows7-8'}else{'windows'}
$stem="fdv-bouldering-timer-v$Version-$variant-$Architecture"
$msi=Join-Path $output ($stem+'.msi')
if(Test-Path -LiteralPath $msi){throw "Refusing to overwrite existing MSI: $msi"}
$work=Join-Path ([IO.Path]::GetTempPath()) ('fdv-msi-'+[guid]::NewGuid().ToString('N'))
if($work.StartsWith($output.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'MSI scratch directory must be outside the release output directory'}
$objects=(Join-Path $work 'obj').Replace('\','/')+'/'
$binary=Join-Path $work 'bin'
New-Item -ItemType Directory -Force $output | Out-Null
$legacyFlag=if($Legacy){'true'}else{'false'}
& dotnet build (Join-Path $projectRoot 'installer/windows/FDVInstaller.wixproj') '-c' 'Release' "-p:PayloadDir=$payload" "-p:Version=$Version" "-p:Platform=$Architecture" "-p:LegacyPackage=$legacyFlag" "-p:BaseIntermediateOutputPath=$objects" "-p:MSBuildProjectExtensionsPath=$objects" '-o' $binary
if($LASTEXITCODE -ne 0){throw 'WiX MSI build failed'}
$built=@(Get-ChildItem -LiteralPath $binary -Filter '*.msi')
if($built.Count -ne 1){throw 'Expected one compiled MSI'}
Copy-Item -LiteralPath $built[0].FullName -Destination $msi
& (Join-Path $PSScriptRoot 'verify-windows-msi.ps1') -MsiPath $msi -PayloadDirectory $payload -Version $Version -Architecture $Architecture -Legacy:$Legacy -OutputDirectory (Join-Path $work 'verification')
Write-Output "Verified MSI: $msi"
Write-Output "Verification report: $(Join-Path $work 'verification/VERIFIED.json')"
