param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
$buildDir = Join-Path $projectDir '.local\dictionary\build'
$distDir = Join-Path $projectDir '.local\dictionary\windows'
$resourceLock = Join-Path $projectDir 'companion\resources.lock.json'
& $Python -m PyInstaller --noconfirm --clean --onedir --name dictionary-companion --hidden-import tkinter --add-data "$resourceLock;." --paths companion --distpath $distDir --workpath $buildDir --specpath $buildDir companion/main.py
if ($LASTEXITCODE -ne 0) { throw 'Companion build failed.' }
Copy-Item -LiteralPath 'companion/install.ps1','companion/uninstall.ps1' -Destination $distDir -Force
Copy-Item -LiteralPath 'companion/requirements.txt' -Destination $distDir -Force
Copy-Item -LiteralPath 'companion/THIRD_PARTY.md' -Destination $distDir -Force
Copy-Item -LiteralPath 'companion/LICENSE' -Destination $distDir -Force
Copy-Item -LiteralPath 'companion/requirements.lock.txt' -Destination $distDir -Force
$runtime = (& $Python -c "import sys,pathlib,json; p=pathlib.Path(sys.base_prefix); print(json.dumps({'version':sys.version.split()[0],'prefix':str(p),'distribution':'conda' if (p/'conda-meta').exists() else 'cpython'}))") | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify bundled Python runtime.' }
$runtimeLicenses = Join-Path $distDir 'dictionary-companion\_internal\licenses'
New-Item -ItemType Directory -Path $runtimeLicenses -Force | Out-Null
$pythonLicense = @('LICENSE.txt','LICENSE_PYTHON.txt') | ForEach-Object { Join-Path $runtime.prefix $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonLicense) { throw 'Python distribution license is missing; refusing to package.' }
Copy-Item -LiteralPath $pythonLicense -Destination (Join-Path $runtimeLicenses 'PYTHON-LICENSE.txt') -Force
Copy-Item -Path 'companion/licenses/*.txt' -Destination $runtimeLicenses -Force
if (Test-Path -LiteralPath 'SOURCE.json') {
  $sourceInfo = Get-Content -LiteralPath 'SOURCE.json' -Raw | ConvertFrom-Json
  $sourceCommit = $sourceInfo.commit
  $sourceVersion = $sourceInfo.version
} else {
  $sourceCommit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Cannot identify companion source commit.' }
  $sourceVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
}
@{version=$sourceVersion;commit=$sourceCommit;platform='windows-x64';protocol=1;python=$runtime.version;runtime=$runtime.distribution} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $distDir 'BUILD.json') -Encoding utf8
Compress-Archive -LiteralPath (Join-Path $distDir 'dictionary-companion'),(Join-Path $distDir 'install.ps1'),(Join-Path $distDir 'uninstall.ps1'),(Join-Path $distDir 'THIRD_PARTY.md'),(Join-Path $distDir 'LICENSE'),(Join-Path $distDir 'requirements.txt'),(Join-Path $distDir 'requirements.lock.txt'),(Join-Path $distDir 'BUILD.json') -DestinationPath (Join-Path (Split-Path $distDir -Parent) 'dictionary-companion-windows-x64.zip') -Force
