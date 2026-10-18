#Requires -Version 7.2
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^v\d+\.\d+\.\d+$')][string]$Tag,
  [Parameter(Mandatory=$true)][string]$Directory,
  [string]$Python = 'python',
  [switch]$Publish,
  [switch]$Direct
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
if (& git status --porcelain) { throw 'Commit all reviewed source changes before releasing.' }
$assetDir = (Resolve-Path -LiteralPath $Directory).Path
& $Python -B (Join-Path $PSScriptRoot 'check-release.py') $assetDir --tag $Tag
if ($LASTEXITCODE -ne 0) { throw 'Complete release asset audit failed.' }
$manifest = Get-Content -LiteralPath (Join-Path $assetDir 'release-manifest.json') -Raw | ConvertFrom-Json
$repository = 'Yvonson/immersive-translate'
$api = 'https://api.github.com/repos/' + $repository
# Read the existing Git login into process memory only. Never print/store it.
$previousPrompt = $env:GIT_TERMINAL_PROMPT
try {
  $env:GIT_TERMINAL_PROMPT='0'
  $credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill
  if ($LASTEXITCODE -ne 0) { throw 'No usable GitHub login in Git Credential Manager.' }
  $credentialMap=@{}
  foreach ($line in $credentialLines) { $parts=$line -split '=',2; if ($parts.Length -eq 2) { $credentialMap[$parts[0]]=$parts[1] } }
  if (-not $credentialMap.password) { throw 'No stored GitHub credential.' }
  $headers=@{Authorization=('Bearer '+$credentialMap.password);Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'}
  $network=@{Headers=$headers;NoProxy=$Direct.IsPresent;TimeoutSec=7200}
  $remoteCommit=Invoke-RestMethod -Uri "$api/commits/$Tag" @network
  if ($remoteCommit.sha -ne $manifest.commit) { throw 'Remote tag does not match the audited source commit.' }
  $runs=Invoke-RestMethod -Uri "$api/actions/runs?head_sha=$($manifest.commit)&per_page=100" @network
  $releaseRun=@($runs.workflow_runs | Where-Object { $_.path -eq '.github/workflows/release.yml' -and $_.head_branch -eq $Tag } | Sort-Object created_at -Descending)[0]
  if (-not $releaseRun -or $releaseRun.conclusion -ne 'success') { throw 'The tagged release workflow must finish successfully before upload/publication.' }
  $allReleases=Invoke-RestMethod -Uri "$api/releases?per_page=100" @network
  $releaseCandidates=@($allReleases | Where-Object tag_name -eq $Tag)
  if ($releaseCandidates.Count -ne 1) { throw 'Expected exactly one draft for the audited tag.' }
  $release=$releaseCandidates[0]
  if (-not $release.draft) { throw 'Refusing to replace assets of a published release.' }
  $expected=@()
  foreach ($name in @($manifest.assets.name) + @('SHA256SUMS.txt','release-manifest.json')) {
    $file=Get-Item -LiteralPath (Join-Path $assetDir $name)
    $expected += [pscustomobject]@{name=$name;bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  foreach ($asset in $expected) {
    # Refresh before each write: an independent transfer may have finished, or
    # another operator may have published the draft while a large upload ran.
    $release=Invoke-RestMethod -Uri "$api/releases/$($release.id)" @network
    if (-not $release.draft) { throw 'Release was published during upload; refusing further writes.' }
    $existing=@($release.assets | Where-Object name -eq $asset.name)
    if ($existing.Count -and $existing[0].size -eq $asset.bytes -and $existing[0].digest -eq ('sha256:'+$asset.sha256)) { Write-Output ('Verified existing asset: '+$asset.name); continue }
    if ($existing.Count) { Invoke-RestMethod -Method Delete -Uri "$api/releases/assets/$($existing[0].id)" @network | Out-Null }
    Write-Output ('Uploading '+$asset.name+' ('+$asset.bytes+' bytes)')
    $upload=($release.upload_url -replace '\{.*$','')+'?name='+[Uri]::EscapeDataString($asset.name)
    $handler=[Net.Http.HttpClientHandler]::new()
    $handler.UseProxy=-not $Direct.IsPresent
    $handler.AllowAutoRedirect=$false
    $http=[Net.Http.HttpClient]::new($handler)
    $http.Timeout=[TimeSpan]::FromHours(2)
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,$upload)
    $request.Version=[Version]'2.0'
    $request.VersionPolicy=[Net.Http.HttpVersionPolicy]::RequestVersionOrLower
    foreach($headerName in $headers.Keys) { $request.Headers.TryAddWithoutValidation($headerName,[string]$headers[$headerName]) | Out-Null }
    $stream=[IO.File]::OpenRead((Join-Path $assetDir $asset.name))
    $request.Content=[Net.Http.StreamContent]::new($stream,262144)
    $request.Content.Headers.ContentType=[Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
    $request.Content.Headers.ContentLength=$asset.bytes
    $timer=[Diagnostics.Stopwatch]::StartNew()
    try {
      $response=$http.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      if(-not $response.IsSuccessStatusCode) { throw ('Asset upload failed: HTTP '+[int]$response.StatusCode) }
      $uploaded=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
      Write-Output ('Uploaded '+$asset.name+' in '+[math]::Round($timer.Elapsed.TotalSeconds,1)+'s')
    } finally { $request.Dispose();$http.Dispose();$handler.Dispose() }
    if ($uploaded.size -ne $asset.bytes -or $uploaded.digest -ne ('sha256:'+$asset.sha256)) { throw ('Remote checksum mismatch: '+$asset.name) }
  }
  $release=Invoke-RestMethod -Uri "$api/releases/$($release.id)" @network
  if (@($release.assets).Count -ne $expected.Count) { throw 'Unexpected remote attachment set; leave draft for review.' }
  foreach ($asset in $expected) {
    $remote=@($release.assets | Where-Object name -eq $asset.name)
    if ($remote.Count -ne 1 -or $remote[0].size -ne $asset.bytes -or $remote[0].digest -ne ('sha256:'+$asset.sha256)) { throw ('Final remote asset verification failed: '+$asset.name) }
  }
  if ($Publish) {
    $body=@{draft=$false;prerelease=$false;make_latest='true';name=('Open Bilingual Translate '+$Tag);body=(Get-Content -LiteralPath (Join-Path $assetDir 'RELEASE-NOTES.md') -Raw)} | ConvertTo-Json
    $release=Invoke-RestMethod -Method Patch -Uri "$api/releases/$($release.id)" -Body $body -ContentType 'application/json; charset=utf-8' @network
    if ($release.draft -or $release.prerelease) { throw 'Release remains unpublished.' }
    Write-Output ('Published: '+$release.html_url)
  } else { Write-Output ('All attachments verified; draft ready: '+$release.html_url) }
} finally {
  $credentialLines=$null; $credentialMap=$null; $headers=$null; $network=$null
  $env:GIT_TERMINAL_PROMPT=$previousPrompt
}
