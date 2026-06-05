#Requires -Version 5.1
<#
.SYNOPSIS
  Convert a Mercurial repository to Git with incremental sync support.

.DESCRIPTION
  Wraps frej/fast-export (hg-fast-export.py + git fast-import) for full-fidelity
  history, branches, tags, and commit messages. State for incremental imports is
  stored under .git/hg2git-* in the target Git repository.

.PARAMETER HgRepo
  Path to a local Mercurial clone.

.PARAMETER GitRepo
  Path to an initialized Git repository (git init).

.PARAMETER Config
  Optional path to .hg-to-git.json (default: search in GitRepo).

.PARAMETER AuthorsMap
  Author mapping file (-A).

.PARAMETER BranchesMap
  Branch mapping file (-B).

.PARAMETER TagsMap
  Tag mapping file (-T).

.PARAMETER DefaultBranch
  Git name for Mercurial's default branch (-M). Default: master.

.PARAMETER Encoding
  Commit/author encoding (-e).

.PARAMETER FileEncoding
  Filename encoding (--fe).

.PARAMETER NoSanitize
  Pass -n to disable hg-fast-export name sanitization (recommended).

.PARAMETER Force
  Ignore validation errors.

.PARAMETER DryRun
  Only validate prerequisites and configuration.

.EXAMPLE
  .\Convert-HgToGit.ps1 -HgRepo D:\src\foo-hg -GitRepo D:\src\foo-git

.EXAMPLE
  # After hg pull, sync new commits into git:
  .\Convert-HgToGit.ps1 -GitRepo D:\src\foo-git
  # (HgRepo read from .hg-to-git.json or .git/hg2git-state)
#>
[CmdletBinding()]
param(
    [string] $HgRepo,
    [string] $GitRepo,
    [string] $Config,
    [string] $AuthorsMap,
    [string] $BranchesMap,
    [string] $TagsMap,
    [string] $DefaultBranch = 'master',
    [string] $Encoding,
    [string] $FileEncoding,
    [string] $FastExportPath,
    [string] $Python,
    [string] $Checkout,
    [int] $MaxRevision = -1,
    [switch] $NoSanitize,
    [switch] $NoHgTags,
    [switch] $SignedOffBy,
    [switch] $IgnoreUnnamedHeads,
    [switch] $Force,
    [switch] $NoRepack,
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string] $p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $null }
    (Resolve-Path -LiteralPath $p).Path
}

function Get-JsonConfig([string] $gitRepo, [string] $configPath) {
    $candidates = @()
    if ($configPath) { $candidates += $configPath }
    else {
        $candidates += (Join-Path $gitRepo '.hg-to-git.json')
        $candidates += (Join-Path $gitRepo 'hg-to-git.json')
    }
    foreach ($f in $candidates) {
        if (Test-Path -LiteralPath $f) {
            return Get-Content -LiteralPath $f -Raw | ConvertFrom-Json
        }
    }
    return $null
}

function Find-PythonWithMercurial([string] $preferred) {
    $candidates = @()
    if ($preferred) { $candidates += $preferred }
    else { $candidates += @('python', 'python3', 'py') }
    foreach ($cmd in $candidates) {
        $ver = & $cmd --version 2>&1
        if ($LASTEXITCODE -ne 0) { continue }
        & $cmd -c 'from mercurial.scmutil import revsymbol' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $cmd }
    }
    throw "Python 3.7+ with mercurial is required. Install: pip install mercurial"
}

function Get-GitDir([string] $gitRepo) {
    $rel = git -C $gitRepo rev-parse --git-dir 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Not a git repository: $gitRepo" }
    $rel = $rel.Trim()
    if ([System.IO.Path]::IsPathRooted($rel)) { $rel } else { Join-Path $gitRepo $rel }
}

function Ensure-FastExport([string] $explicit) {
    if ($explicit) {
        $dir = Resolve-FullPath $explicit
        if (-not (Test-Path (Join-Path $dir 'hg-fast-export.py'))) {
            throw "fast-export not found at $dir"
        }
        return $dir
    }
    $scriptRoot = Split-Path -Parent $PSScriptRoot
    $local = Join-Path $scriptRoot 'vendor\fast-export'
    if (Test-Path (Join-Path $local 'hg-fast-export.py')) { return $local }
    $cache = Join-Path $env:LOCALAPPDATA 'hg-to-git\fast-export'
    if (Test-Path (Join-Path $cache 'hg-fast-export.py')) { return $cache }
    New-Item -ItemType Directory -Force -Path (Split-Path $cache) | Out-Null
    git clone --depth 1 https://github.com/frej/fast-export.git $cache | Out-Null
    if (-not (Test-Path (Join-Path $cache 'hg-fast-export.py'))) {
        throw "Failed to clone fast-export to $cache"
    }
    return $cache
}

function Read-HgTip([string] $gitDir) {
    $state = Join-Path $gitDir 'hg2git-state'
    if (-not (Test-Path $state)) { return 0 }
    foreach ($line in Get-Content -LiteralPath $state) {
        if ($line -match '^:tip\s+(\d+)') { return [int]$Matches[1] }
    }
    0
}

function Backup-StateFiles([string] $gitDir) {
    foreach ($suffix in @('state', 'marks', 'mapping', 'heads')) {
        $f = Join-Path $gitDir "hg2git-$suffix"
        if (Test-Path $f) { Copy-Item $f "$f~" -Force }
    }
}

function Merge-Marks([string] $gitDir) {
    $marks = Join-Path $gitDir 'hg2git-marks'
    $tmp = "$marks.tmp"
    $old = "$marks.old"
    if (Test-Path $marks) { Copy-Item $marks $old -Force } else { Set-Content $old '' }
    $lines = @()
    $seen = @{}
    foreach ($src in @($old, $tmp)) {
        if (-not (Test-Path $src)) { continue }
        foreach ($line in Get-Content -LiteralPath $src) {
            if (-not $line -or $seen.ContainsKey($line)) { continue }
            $seen[$line] = $true
            $lines += $line
        }
    }
    Set-Content -LiteralPath $marks -Value $lines -Encoding utf8NoBOM
}

function Write-HeadsCache([string] $gitRepo, [string] $gitDir) {
    $heads = git -C $gitRepo for-each-ref --format='%(refname:short)' refs/heads/
    $lines = @()
    foreach ($head in $heads) {
        if (-not $head) { continue }
        $id = (git -C $gitRepo rev-parse "refs/heads/$head").Trim()
        $lines += ":$head $id"
    }
    Set-Content -LiteralPath (Join-Path $gitDir 'hg2git-heads') -Value $lines -Encoding utf8NoBOM
}

# --- Load config ---
$json = $null
if ($GitRepo) { $json = Get-JsonConfig (Resolve-FullPath $GitRepo) $Config }
if ($json) {
    if (-not $HgRepo -and $json.hgRepo) { $HgRepo = $json.hgRepo }
    if (-not $GitRepo -and $json.gitRepo) { $GitRepo = $json.gitRepo }
    if (-not $AuthorsMap -and $json.authorsMap) { $AuthorsMap = $json.authorsMap }
    if (-not $BranchesMap -and $json.branchesMap) { $BranchesMap = $json.branchesMap }
    if (-not $TagsMap -and $json.tagsMap) { $TagsMap = $json.tagsMap }
    if ($json.defaultBranch) { $DefaultBranch = $json.defaultBranch }
    if ($json.encoding) { $Encoding = $json.encoding }
    if ($json.fileEncoding) { $FileEncoding = $json.fileEncoding }
    if ($json.fastExportPath) { $FastExportPath = $json.fastExportPath }
    if ($json.python) { $Python = $json.python }
    if ($json.checkoutBranch) { $Checkout = $json.checkoutBranch }
    if ($null -ne $json.sanitizeNames -and -not $NoSanitize) {
        if (-not $json.sanitizeNames) { $NoSanitize = $true }
    }
    if ($json.force) { $Force = $true }
}

if (-not $GitRepo) { throw "GitRepo is required (parameter or config)." }
$GitRepo = Resolve-FullPath $GitRepo
$gitDir = Get-GitDir $GitRepo

if (-not $HgRepo) {
    $state = Join-Path $gitDir 'hg2git-state'
    if (Test-Path $state) {
        foreach ($line in Get-Content $state) {
            if ($line -match '^:repo\s+(.+)$') { $HgRepo = $Matches[1].Trim(); break }
        }
    }
}
if (-not $HgRepo) { throw "HgRepo is required (parameter, config, or prior import state)." }
$HgRepo = Resolve-FullPath $HgRepo

if (-not (Test-Path (Join-Path $HgRepo '.hg'))) {
    throw "Not a Mercurial repository: $HgRepo"
}

$ignoreCase = (git -C $GitRepo config --get core.ignoreCase 2>$null)
if ($ignoreCase -eq 'true' -and -not $Force) {
    throw @"
git core.ignoreCase is true. Set it false before converting:
  git -C "$GitRepo" config core.ignoreCase false
Or pass -Force (not recommended).
"@
}

$py = Find-PythonWithMercurial $Python
Write-Host "Python: $(& $py --version 2>&1)"
Write-Host "Git:    $(git --version)"
Write-Host "Hg:     $((hg --version | Select-Object -First 1))"
Write-Host "Hg repo:  $HgRepo"
Write-Host "Git repo: $GitRepo"

if ($DryRun) { Write-Host 'Dry run OK.'; exit 0 }

$fastExport = Ensure-FastExport $FastExportPath
$tipBefore = Read-HgTip $gitDir
Backup-StateFiles $gitDir
$marks = Join-Path $gitDir 'hg2git-marks'
if (-not (Test-Path $marks)) { New-Item -ItemType File -Path $marks | Out-Null }

$pyArgs = @(
    (Join-Path $fastExport 'hg-fast-export.py'),
    '--repo', $HgRepo,
    '--marks', $marks,
    '--mapping', (Join-Path $gitDir 'hg2git-mapping'),
    '--heads', (Join-Path $gitDir 'hg2git-heads'),
    '--status', (Join-Path $gitDir 'hg2git-state'),
    '-M', $DefaultBranch
)
if ($AuthorsMap) { $pyArgs += '-A', (Resolve-FullPath $AuthorsMap) }
if ($BranchesMap) { $pyArgs += '-B', (Resolve-FullPath $BranchesMap) }
if ($TagsMap) { $pyArgs += '-T', (Resolve-FullPath $TagsMap) }
if ($Encoding) { $pyArgs += '-e', $Encoding }
if ($FileEncoding) { $pyArgs += '--fe', $FileEncoding }
if ($SignedOffBy) { $pyArgs += '-s' }
if (-not $NoHgTags) { $pyArgs += '--hgtags' }
if ($IgnoreUnnamedHeads) { $pyArgs += '--ignore-unnamed-heads' }
if ($Force) { $pyArgs += '--force' }
if ($MaxRevision -ge 0) { $pyArgs += '-m', "$MaxRevision" }
if ($NoSanitize) { $pyArgs += '-n' }

$marksTmp = "$marks.tmp"
$env:GIT_DIR = $gitDir

$pyProc = Start-Process -FilePath $py -ArgumentList $pyArgs -NoNewWindow -PassThru `
    -RedirectStandardOutput Pipe -RedirectStandardError Inherit
$giArgs = @('-C', $GitRepo, 'fast-import', "--export-marks=$marksTmp")
if ($Force) { $giArgs += '--force' }
$giProc = Start-Process -FilePath 'git' -ArgumentList $giArgs -NoNewWindow -PassThru `
    -RedirectStandardInput Pipe -RedirectStandardError Inherit

$pyProc.StandardOutput.BaseStream.CopyTo($giProc.StandardInput.BaseStream)
$pyProc.StandardOutput.Close()
$giProc.StandardInput.Close()
$pyProc.WaitForExit()
$giProc.WaitForExit()

if ($pyProc.ExitCode -ne 0 -or $giProc.ExitCode -ne 0) {
    throw "Conversion failed (python=$($pyProc.ExitCode), fast-import=$($giProc.ExitCode))"
}

Merge-Marks $gitDir
Write-HeadsCache $GitRepo $gitDir

$tipAfter = Read-HgTip $gitDir
$delta = [Math]::Max(0, $tipAfter - $tipBefore)
if ($tipBefore -gt 0) {
    Write-Host "Incremental import: $delta new hg revision(s)."
} else {
    Write-Host "Initial import complete ($delta revision(s) in this run)."
}
Write-Host "State: $gitDir\hg2git-{state,marks,mapping,heads}"

if (-not $NoRepack) { git -C $GitRepo gc --auto | Out-Null }
if ($Checkout) {
    git -C $GitRepo checkout $Checkout 2>&1 | Write-Host
}

Write-Host 'Re-run after hg pull to sync incrementally.'
