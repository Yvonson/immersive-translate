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
Compress-Archive -LiteralPath (Join-Path $distDir 'dictionary-companion'),(Join-Path $distDir 'install.ps1'),(Join-Path $distDir 'uninstall.ps1'),(Join-Path $distDir 'THIRD_PARTY.md'),(Join-Path $distDir 'LICENSE'),(Join-Path $distDir 'requirements.txt'),(Join-Path $distDir 'requirements.lock.txt') -DestinationPath (Join-Path (Split-Path $distDir -Parent) 'dictionary-companion-windows-x64.zip') -Force
