param([switch]$DeleteResources)
$ErrorActionPreference = 'Stop'
$targetDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenBilingualTranslate\Companion'))
$expectedDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenBilingualTranslate'))
if (-not $targetDir.StartsWith($expectedDir + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation path.' }
$binary = Join-Path $targetDir 'dictionary-companion.exe'
if (Test-Path -LiteralPath $binary) { & $binary --unregister }
if (Test-Path -LiteralPath $targetDir) { Remove-Item -LiteralPath $targetDir -Recurse -Force }
if ($DeleteResources) {
  $resourceDir = [IO.Path]::GetFullPath((Join-Path $expectedDir 'Dictionary'))
  if (-not $resourceDir.StartsWith($expectedDir + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected resource path.' }
  if (Test-Path -LiteralPath $resourceDir) { Remove-Item -LiteralPath $resourceDir -Recurse -Force }
}
Write-Output 'Native host uninstalled. Resources are retained unless -DeleteResources was specified. Custom resource paths must be removed manually.'
