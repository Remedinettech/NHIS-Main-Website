<#
.SYNOPSIS
  Compares the Backend folder on the server with the release package, file by file (read-only).

.DESCRIPTION
  Backend-manifest.txt (shipped next to this script) lists every source file of the release with a SHA-256 of its content
  (line endings normalised, so a CRLF copy equals an LF copy). The script reports files that are MISSING on the server,
  files whose content DIFFERS, and files under nhis-api\src or packages\shared-types\src that are not part of the release
  (EXTRA, for example test files or leftovers). It never writes anything and never reads or prints .env files.
  File names with [brackets] (Next.js dynamic routes) are handled literally.

  Usage (Windows PowerShell 5.1 or later, any folder):
    powershell -ExecutionPolicy Bypass -File Verify-Backend.ps1 -Server D:\TN_NHIS_WEBSITE\Backend
  Exit code 0 = identical, 1 = something is missing or different.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Manifest = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Manifest) { $Manifest = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Backend-manifest.txt' }
if (-not [System.IO.Directory]::Exists($Server)) { throw "Folder not found: $Server" }
if (-not [System.IO.File]::Exists($Manifest)) { throw "Manifest not found: $Manifest" }

$sha = [System.Security.Cryptography.SHA256]::Create()
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Get-NormalisedHash([string]$path) {
  $text = $utf8.GetString([System.IO.File]::ReadAllBytes($path)).Replace("`r`n", "`n")
  ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($text))) -replace '-', '').ToLowerInvariant()
}

$expected = @{}
foreach ($line in [System.IO.File]::ReadAllLines($Manifest)) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line -split '  ', 2
  $expected[$parts[1]] = $parts[0]
}

$missing = New-Object System.Collections.Generic.List[string]
$different = New-Object System.Collections.Generic.List[string]
$same = 0
foreach ($rel in ($expected.Keys | Sort-Object)) {
  $path = [System.IO.Path]::Combine($Server, $rel)
  if (-not [System.IO.File]::Exists($path)) { $missing.Add($rel); continue }
  if ((Get-NormalisedHash $path) -eq $expected[$rel]) { $same++ } else { $different.Add($rel) }
}

$extra = New-Object System.Collections.Generic.List[string]
foreach ($sub in 'nhis-api\src', 'packages\shared-types\src') {
  $dir = [System.IO.Path]::Combine($Server, $sub)
  if (-not [System.IO.Directory]::Exists($dir)) { continue }
  foreach ($file in [System.IO.Directory]::EnumerateFiles($dir, '*', [System.IO.SearchOption]::AllDirectories)) {
    $rel = $file.Substring($Server.TrimEnd('\').Length + 1)
    if (-not $expected.ContainsKey($rel)) { $extra.Add($rel) }
  }
}

Write-Host ("Release files: {0}   identical: {1}   MISSING: {2}   DIFFERENT: {3}   extra (not in the release): {4}" -f $expected.Count, $same, $missing.Count, $different.Count, $extra.Count)
foreach ($f in $missing)   { Write-Host "  MISSING    $f" -ForegroundColor Red }
foreach ($f in $different) { Write-Host "  DIFFERENT  $f" -ForegroundColor Yellow }
foreach ($f in ($extra | Select-Object -First 25)) { Write-Host "  extra      $f" -ForegroundColor DarkGray }
if ($extra.Count -gt 25) { Write-Host ("  ... and {0} more extra files" -f ($extra.Count - 25)) -ForegroundColor DarkGray }
if ($missing.Count -eq 0 -and $different.Count -eq 0) { Write-Host 'The Backend source matches the release.' -ForegroundColor Green; exit 0 }
Write-Host 'Copy the MISSING and DIFFERENT files from the package (robocopy handles [brackets]; do not use Copy-Item with them), then rebuild.' -ForegroundColor Red
exit 1
