$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'server-audio-player.cs'
try {
  $audioLibrary = Join-Path (Split-Path -Parent $sourcePath) 'vendor\NAudio.dll'
  [Reflection.Assembly]::LoadFrom($audioLibrary) | Out-Null
  Add-Type -Path $sourcePath -ReferencedAssemblies 'System','System.Core','System.Web.Extensions','System.Speech',$audioLibrary
  [FDVNativeAudio.Player]::Run()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
