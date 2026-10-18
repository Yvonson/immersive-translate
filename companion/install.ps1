param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$DataDir = "$env:LOCALAPPDATA\OpenBilingualTranslate\Dictionary",
  [switch]$NoManage
)
$ErrorActionPreference = 'Stop'
$sourceDir = Join-Path $PSScriptRoot 'dictionary-companion'
$targetDir = Join-Path $env:LOCALAPPDATA 'OpenBilingualTranslate\Companion'
if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'dictionary-companion.exe'))) { throw 'Extract the full companion ZIP before installing.' }
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir 'dictionary-companion.exe') -Destination $targetDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir '_internal') -Destination $targetDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE'),(Join-Path $PSScriptRoot 'THIRD_PARTY.md') -Destination $targetDir -Force
& (Join-Path $targetDir 'dictionary-companion.exe') --install $ExtensionId --data-dir $DataDir
if ($LASTEXITCODE -ne 0) { throw 'Native host registration failed.' }
if (-not $NoManage) { & (Join-Path $targetDir 'dictionary-companion.exe') --manage }
