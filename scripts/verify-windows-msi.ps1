param(
    [Parameter(Mandatory=$true)][string]$MsiPath,
    [Parameter(Mandatory=$true)][string]$PayloadDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [Parameter(Mandatory=$true)][string]$Version,
    [ValidateSet('x86','x64')][string]$Architecture='x64',
    [switch]$Legacy
)
$ErrorActionPreference='Stop'
trap { Write-Output $_.ScriptStackTrace; throw $_ }
$msi=(Resolve-Path -LiteralPath $MsiPath).Path
$payload=(Resolve-Path -LiteralPath $PayloadDirectory).Path.TrimEnd('\')
$output=[IO.Path]::GetFullPath($OutputDirectory)
$expanded=Join-Path $output 'administrative-image'
if(Test-Path -LiteralPath $expanded){throw "Verification requires a fresh administrative image: $expanded"}
New-Item -ItemType Directory -Force $output | Out-Null
function Assert-Equal($actual,$expected,$message){if($actual -cne $expected){throw "$message (expected '$expected', received '$actual')"}}
$installer=New-Object -ComObject WindowsInstaller.Installer
$database=$installer.OpenDatabase($msi,0)
function Read-Rows([string]$query,[string[]]$columns){
    $view=$database.OpenView($query)
    try{
        [void]$view.Execute()
        while($null -ne ($record=$view.Fetch())){
            try{
                $row=@{}
                for($i=0;$i -lt $columns.Length;$i++){$row[$columns[$i]]=$record.StringData($i+1)}
                [pscustomobject]$row
            }finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($record)}
        }
    }finally{[void]$view.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)}
}
try{
    $properties=@{}
    foreach($row in (Read-Rows 'SELECT `Property`, `Value` FROM `Property`' @('Name','Value'))){$properties[$row.Name]=$row.Value}
    Assert-Equal $properties.ProductVersion $Version 'MSI product version'
    Assert-Equal $properties.ALLUSERS '1' 'MSI installation scope'
    $expectedName=if($Legacy){"FDV Bouldering Timer (Windows 7-8 $Architecture)"}else{'FDV Bouldering Timer'}
    Assert-Equal $properties.ProductName $expectedName 'MSI product name'
    $upgrade=if(!$Legacy){'{B72ED423-6973-467C-8AB5-7F85D90CF8D9}'}elseif($Architecture -eq 'x64'){'{31EFCB29-AD9A-4E08-9B01-F20A68727C19}'}else{'{CDF4D4AB-5521-427C-B10B-92F10BF6B90D}'}
    Assert-Equal $properties.UpgradeCode $upgrade 'MSI upgrade family'
    [void]$database.Export('_ForceCodepage',$output,'codepage.idt')
    $codepageText=[IO.File]::ReadAllText((Join-Path $output 'codepage.idt'))
    if($codepageText -notmatch '(?m)^(\d+)\s+_ForceCodepage') {throw 'Cannot read MSI database codepage'}
    $codepage=[int]$Matches[1]
    $expectedCodepage=if($Legacy){1251}else{65001}
    Assert-Equal $codepage $expectedCodepage 'MSI database codepage'
    $summary=$database.SummaryInformation(0)
    try{
        $template=$summary.Property(7)
        $minimumInstaller=[int]$summary.Property(14)
        $expectedPlatform=if($Architecture -eq 'x64'){'x64'}else{'Intel'}
        Assert-Equal ($template.Split(';')[0]) $expectedPlatform 'MSI processor template'
        Assert-Equal $minimumInstaller 500 'Minimum Windows Installer version'
    }finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($summary)}
    $directory=@(Read-Rows 'SELECT `Directory_Parent`, `DefaultDir` FROM `Directory` WHERE `Directory` = ''INSTALLFOLDER''' @('Parent','Name'))
    $expectedParent=if($Architecture -eq 'x64'){'ProgramFiles64Folder'}else{'ProgramFilesFolder'}
    Assert-Equal $directory[0].Parent $expectedParent 'MSI Program Files root'
    $folder=if($Legacy){'FDV Bouldering Timer Legacy'}else{'FDV Bouldering Timer'}
    Assert-Equal ($directory[0].Name.Split('|')[-1]) $folder 'MSI application folder'
    $components=@{}
    foreach($row in (Read-Rows 'SELECT `Component`, `Attributes` FROM `Component`' @('Id','Attributes'))){$components[$row.Id]=[int]$row.Attributes}
    foreach($row in (Read-Rows 'SELECT `File`, `Component_` FROM `File`' @('Id','Component'))){
        Assert-Equal (($components[$row.Component] -band 256) -ne 0) ($Architecture -eq 'x64') ('MSI file component bitness: '+$row.Id)
    }
    $shortcuts=@(Read-Rows 'SELECT `Directory_`, `Target`, `WkDir` FROM `Shortcut`' @('Directory','Target','WorkingDirectory'))
    Assert-Equal $shortcuts.Length 2 'MSI shortcut count'
    foreach($shortcut in $shortcuts){
        Assert-Equal $shortcut.Target '[INSTALLFOLDER]fdv-bouldering-timer.exe' 'MSI shortcut target'
        Assert-Equal $shortcut.WorkingDirectory 'INSTALLFOLDER' 'MSI shortcut working directory'
    }
    [xml]$authored=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../installer/windows/Product.wxs'))
    $labels=@{}
    foreach($row in (Read-Rows 'SELECT `Control`, `Text` FROM `Control` WHERE `Dialog_` = ''ShortcutOptionsDlg''' @('Id','Text'))){$labels[$row.Id]=$row.Text}
    foreach($control in $authored.SelectNodes('//*[local-name()="Dialog" and @Id="ShortcutOptionsDlg"]/*[local-name()="Control" and @Text]')){
        Assert-Equal $labels[$control.Id] $control.Text 'MSI Russian control text'
    }
    if($Legacy){
        $conditions=@(Read-Rows 'SELECT `Condition` FROM `LaunchCondition`' @('Condition'))
        if(!($conditions.Condition -contains 'Installed OR (VersionNT >= 601 AND (VersionNT > 601 OR ServicePackLevel >= 1))')){throw 'Missing Win7 SP1 launch condition'}
    }
}finally{
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($database)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
}
# Administrative extraction only: do not install/register the product or launch its GUI.
$log=Join-Path $output 'administrative-extraction.log'
$arguments='/a "'+$msi+'" /qn TARGETDIR="'+$expanded+'" /L*v "'+$log+'"'
$process=Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
if(!$process.WaitForExit(180000)){throw 'Administrative MSI extraction timed out'}
if($process.ExitCode -ne 0){Get-Content -LiteralPath $log -Tail 50;throw "Administrative MSI extraction failed: $($process.ExitCode)"}
$launchers=@(Get-ChildItem -LiteralPath $expanded -Recurse -Filter 'fdv-bouldering-timer.exe')
Assert-Equal $launchers.Length 1 'Extracted launcher count'
$installed=Split-Path $launchers[0].FullName -Parent
$count=0
foreach($file in (Get-ChildItem -LiteralPath $payload -Recurse -File)){
    $relative=$file.FullName.Substring($payload.Length+1)
    $target=Join-Path $installed $relative
    if(!(Test-Path -LiteralPath $target -PathType Leaf)){throw "Missing extracted file: $relative"}
    Assert-Equal (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash ("Extracted file checksum: $relative")
    $count++
}
$extraFiles=if($Legacy){2}else{1}
Assert-Equal @(Get-ChildItem -LiteralPath $installed -Recurse -File).Length ($count+$extraFiles) 'MSI adds only the marker and optional MSI instructions'
$marker=Join-Path $installed 'fdv-installed.marker'
Assert-Equal (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../installer/common/fdv-installed.marker') -Algorithm SHA256).Hash 'Installed-package marker'
if($Legacy){
    Assert-Equal (Get-FileHash -LiteralPath (Join-Path $installed 'ReadMe-MSI.txt') -Algorithm SHA256).Hash (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../installer/windows/ReadMe-legacy-msi.txt') -Algorithm SHA256).Hash 'Installed MSI instructions'
    [xml]$config=Get-Content -LiteralPath (Join-Path $installed 'fdv-bouldering-timer.exe.config') -Raw
    if(!(@($config.configuration.startup.supportedRuntime.version) -contains 'v2.0.50727')){throw 'Legacy MSI does not retain CLR2 support'}
}
& node (Join-Path $PSScriptRoot 'smoke-msi-server.js') $installed (Join-Path $output 'isolated-profile')
if($LASTEXITCODE -ne 0){throw 'Extracted MSI server smoke test failed'}
$report=@{version=$Version;architecture=$Architecture;legacy=[bool]$Legacy;productName=$properties.ProductName;upgradeCode=$properties.UpgradeCode;minimumInstaller=$minimumInstaller;template=$template;codepage=$codepage;payloadFiles=$count;administrativeExtraction=$true;payloadChecksumsMatch=$true;serverSmokePassed=$true;sha256=(Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $output 'VERIFIED.json'),($report|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output "MSI tables, $count payload checksums and extracted server verified ($Architecture, legacy=$Legacy)."
