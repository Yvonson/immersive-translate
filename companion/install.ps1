param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$DataDir = "$env:LOCALAPPDATA\OpenBilingualTranslate\Dictionary",
  [switch]$NoManage
)
$ErrorActionPreference = 'Stop'
$sourceDir = Join-Path $PSScriptRoot 'dictionary-companion'
$installationRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenBilingualTranslate'))
$targetDir = Join-Path $installationRoot 'Companion'
$stagingDir = Join-Path $installationRoot ('Companion-install-' + [guid]::NewGuid().ToString('N'))
$backupDir = Join-Path $installationRoot ('Companion-backup-' + [guid]::NewGuid().ToString('N'))
foreach ($path in @($targetDir,$stagingDir,$backupDir)) {
  if (-not ([IO.Path]::GetFullPath($path)).StartsWith($installationRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation path.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'dictionary-companion.exe'))) { throw 'Extract the full companion ZIP before installing.' }
$previousSettings = Join-Path $targetDir 'settings.json'
if (-not $PSBoundParameters.ContainsKey('DataDir') -and (Test-Path -LiteralPath $previousSettings)) {
  $previousDataDir = (Get-Content -LiteralPath $previousSettings -Raw -Encoding UTF8 | ConvertFrom-Json).dataDir
  if ($previousDataDir -is [string] -and $previousDataDir) { $DataDir = $previousDataDir }
}
$movedOld = $false
$movedNew = $false
try {
  New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceDir 'dictionary-companion.exe'),(Join-Path $sourceDir '_internal') -Destination $stagingDir -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE'),(Join-Path $PSScriptRoot 'THIRD_PARTY.md') -Destination $stagingDir -Force
  if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'BUILD.json')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'BUILD.json') -Destination $stagingDir -Force }
  # Replace the whole runtime, so DLLs from an older Python distribution cannot linger.
  if (Test-Path -LiteralPath $targetDir) { Move-Item -LiteralPath $targetDir -Destination $backupDir; $movedOld=$true }
  Move-Item -LiteralPath $stagingDir -Destination $targetDir
  $movedNew=$true
  & (Join-Path $targetDir 'dictionary-companion.exe') --install $ExtensionId --data-dir $DataDir
  if ($LASTEXITCODE -ne 0) { throw 'Native host registration failed.' }
} catch {
  $installError = $_
  if ($movedNew) { Move-Item -LiteralPath $targetDir -Destination $stagingDir }
  if ($movedOld) { Move-Item -LiteralPath $backupDir -Destination $targetDir }
  throw $installError
} finally {
  if (Test-Path -LiteralPath $stagingDir) { Remove-Item -LiteralPath $stagingDir -Recurse -Force }
}
if ($movedOld) {
  try { Remove-Item -LiteralPath $backupDir -Recurse -Force }
  catch { Write-Warning 'The previous runtime is still in use. It was retained in the Companion-backup directory; close its process before removing it.' }
}
if (-not $NoManage) { & (Join-Path $targetDir 'dictionary-companion.exe') --manage }
