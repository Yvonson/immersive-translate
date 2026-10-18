#Requires -Version 7.2
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^v\d+\.\d+\.\d+$')][string]$Tag,
  [string]$Directory,
  [string]$Python = 'python',
  [switch]$Publish,
  [switch]$Direct
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
if (& git status --porcelain) { throw 'Commit reviewed source changes before preparing a release.' }
$sourceCommit = (& git rev-parse ($Tag+'^{commit}')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'The reviewed source tag must exist locally.' }
$previousPrompt = $env:GIT_TERMINAL_PROMPT
$previousToken = $env:GH_TOKEN
try {
  if (-not $env:GH_TOKEN) {
    $env:GIT_TERMINAL_PROMPT='0'
    $credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'No usable GitHub login in Git Credential Manager.' }
    $credentialMap=@{}
    foreach ($line in $credentialLines) { $parts=$line -split '=',2; if ($parts.Length -eq 2) { $credentialMap[$parts[0]]=$parts[1] } }
    if (-not $credentialMap.password) { throw 'No stored GitHub credential.' }
    $env:GH_TOKEN=$credentialMap.password
  }
  $mode=if ($Publish) {'publish'} else {'verify'}
  $arguments=@('-B',(Join-Path $PSScriptRoot 'reorganize-release.py'),'--mode',$mode,'--tag',$Tag,'--source-commit',$sourceCommit)
  if ($Directory) { $arguments+=@('--directory',(Resolve-Path -LiteralPath $Directory).Path) }
  if ($Direct) { $arguments+='--direct' }
  & $Python @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Release verification/publication failed; see the named validation error. Old verified downloads are retained until replacements pass.' }
} finally {
  $credentialLines=$null; $credentialMap=$null
  $env:GH_TOKEN=$previousToken
  $env:GIT_TERMINAL_PROMPT=$previousPrompt
}
