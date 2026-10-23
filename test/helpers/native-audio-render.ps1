$ErrorActionPreference = 'Stop'
$renderRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$renderLibrary = Join-Path $renderRoot 'lib/vendor/NAudio.dll'
[Reflection.Assembly]::LoadFrom($renderLibrary) | Out-Null
Add-Type -Path @((Join-Path $renderRoot 'lib/server-audio-player.cs'),(Join-Path $PSScriptRoot 'native-audio-render.cs')) -ReferencedAssemblies 'System','System.Core','System.Web.Extensions','System.Speech',$renderLibrary
[NativeRenderChecks]::Run()
