param([string]$Python='python')
$ErrorActionPreference='Stop'
$projectDir=Split-Path -Parent $PSScriptRoot
$archive=Join-Path $projectDir '.local/dictionary/dictionary-companion-sources.zip'
$temporary=[IO.Path]::GetFullPath((Join-Path $projectDir ('.local/dictionary/source-smoke-'+[guid]::NewGuid().ToString('N'))))
$expectedRoot=[IO.Path]::GetFullPath((Join-Path $projectDir '.local/dictionary'))
if (-not $temporary.StartsWith($expectedRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected source test directory.' }
$pythonBinary=(& $Python -c 'import sys; print(sys.executable)').Trim()
try {
  Expand-Archive -LiteralPath $archive -DestinationPath $temporary
  & (Join-Path $temporary 'scripts/build-companion.ps1') -Python $pythonBinary
  if ($LASTEXITCODE -ne 0) { throw 'Standalone source archive build failed.' }
  $sourceInfo=Get-Content -LiteralPath (Join-Path $temporary 'SOURCE.json') -Raw | ConvertFrom-Json
  $buildInfo=Get-Content -LiteralPath (Join-Path $temporary '.local/dictionary/windows/BUILD.json') -Raw | ConvertFrom-Json
  if ($sourceInfo.commit -ne $buildInfo.commit -or $sourceInfo.version -ne $buildInfo.version) { throw 'Source archive metadata mismatch.' }
  & (Join-Path $temporary '.local/dictionary/windows/dictionary-companion/dictionary-companion.exe') --diagnose
  if ($LASTEXITCODE -ne 0) { throw 'Rebuilt runtime diagnostic failed.' }
  Write-Output 'Standalone GPL source archive rebuild and Tk/SQLite diagnostic OK.'
} finally {
  Set-Location -LiteralPath $projectDir
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
