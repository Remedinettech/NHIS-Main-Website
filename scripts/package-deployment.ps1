<#
.SYNOPSIS
  Builds the TN-NHIS IIS deployment package (no secrets, no database dumps, no uploads).

.DESCRIPTION
  Produces  deploy-package\TN_NHIS_WEBSITE\  and  deploy-package\TN_NHIS_WEBSITE_<date>.zip  with this layout, which
  mirrors J:\TN_NHIS_WEBSITE on the server:

    Client\     production build of nhis-client  (IIS application TNNHIS)       + web.config
    Admin\      production build of nhis-admin   (IIS application TNNHISAdmin)  + web.config
    ApiProxy\   web.config only                  (IIS application TNNHISApi)
    Backend\    backend workspace SOURCE: root package.json + package-lock.json, packages\shared-types, nhis-api, and the
                package.json of the two frontends (so the committed lock file stays valid; their code is not shipped)
                -> on the server: npm ci -w nhis-api, prisma generate, next build, then start the service
    Service\    WinSW service definition (the WinSW exe itself is not bundled)
    Config\     nhis-api.env.template (no real values)
    Docs\       IIS-DEPLOYMENT.md

  Never included: .env files, .local-* files, database-backup, SQL dumps, nhis-api\storage (uploads), node_modules,
  .next, tests, reference. The package is scanned for such files and for connection strings containing passwords.

  Run from the repository root:   powershell -ExecutionPolicy Bypass -File scripts\package-deployment.ps1
  Use -SkipBuild to package the existing dist folders without rebuilding.
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDir) { $OutputDir = Join-Path $root 'deploy-package' }
$stamp = Get-Date -Format 'yyyy-MM-dd'
$pkg = Join-Path $OutputDir 'TN_NHIS_WEBSITE'
$zip = Join-Path $OutputDir "TN_NHIS_WEBSITE_$stamp.zip"

function Invoke-Robocopy([string]$From, [string]$To, [string[]]$Extra) {
  & robocopy $From $To /E /NFL /NDL /NJH /NJS /NP @Extra | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $From -> $To" }
  $global:LASTEXITCODE = 0
}

Push-Location $root
try {
  if (-not $SkipBuild) {
    Write-Host '== Typecheck and production builds =='
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
    & npm run build -w nhis-client
    if ($LASTEXITCODE -ne 0) { throw 'client build failed' }
    & npm run build -w nhis-admin
    if ($LASTEXITCODE -ne 0) { throw 'admin build failed' }
  }

  foreach ($d in 'nhis-client\dist', 'nhis-admin\dist') {
    if (-not (Test-Path (Join-Path $root "$d\index.html"))) { throw "$d\index.html missing - build first (omit -SkipBuild)." }
    if (-not (Test-Path (Join-Path $root "$d\web.config"))) { throw "$d\web.config missing (it must come from public\web.config)." }
  }
  if (-not (Select-String -Path (Join-Path $root 'nhis-client\dist\index.html') -Pattern '/TNNHIS/assets/' -Quiet)) { throw 'Client build does not use the /TNNHIS/ base.' }
  if (-not (Select-String -Path (Join-Path $root 'nhis-admin\dist\index.html') -Pattern '/TNNHISAdmin/assets/' -Quiet)) { throw 'Admin build does not use the /TNNHISAdmin/ base.' }

  Write-Host "== Assembling $pkg =="
  if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $pkg | Out-Null

  # Static PDFs under Client\documents are build-time copies; the live files are served by the API from Uploads.
  Invoke-Robocopy (Join-Path $root 'nhis-client\dist') (Join-Path $pkg 'Client') @('/XD', (Join-Path $root 'nhis-client\dist\documents'))
  Invoke-Robocopy (Join-Path $root 'nhis-admin\dist') (Join-Path $pkg 'Admin') @()

  New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'ApiProxy') | Out-Null
  Copy-Item (Join-Path $root 'deploy\iis\ApiProxy\web.config') (Join-Path $pkg 'ApiProxy\web.config')

  $be = Join-Path $pkg 'Backend'
  New-Item -ItemType Directory -Force -Path $be | Out-Null
  Copy-Item (Join-Path $root 'package.json') $be
  Copy-Item (Join-Path $root 'package-lock.json') $be
  Invoke-Robocopy (Join-Path $root 'packages\shared-types') (Join-Path $be 'packages\shared-types') @('/XD', 'node_modules', 'dist', '/XF', '*.tsbuildinfo')
  Invoke-Robocopy (Join-Path $root 'nhis-api') (Join-Path $be 'nhis-api') @(
    '/XD', (Join-Path $root 'nhis-api\node_modules'), (Join-Path $root 'nhis-api\.next'), (Join-Path $root 'nhis-api\storage'),
           (Join-Path $root 'nhis-api\.e2e-storage'), (Join-Path $root 'nhis-api\uploads'),
    '/XF', '.env', '.env.*', '.local-*', '*.tsbuildinfo', '*.log', 'tsconfig.mine.json', '*.test.ts')
  Remove-Item (Join-Path $be 'nhis-api\src\test') -Recurse -Force -ErrorAction SilentlyContinue
  foreach ($w in 'nhis-client', 'nhis-admin') {   # manifests only, so the lock file matches the workspace list
    New-Item -ItemType Directory -Force -Path (Join-Path $be $w) | Out-Null
    Copy-Item (Join-Path $root "$w\package.json") (Join-Path $be "$w\package.json")
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'Service'), (Join-Path $pkg 'Config'), (Join-Path $pkg 'Docs') | Out-Null
  Copy-Item (Join-Path $root 'deploy\windows-service\tnnhis-api.xml') (Join-Path $pkg 'Service')
  Copy-Item (Join-Path $root 'deploy\env\nhis-api.env.template') (Join-Path $pkg 'Config')
  Copy-Item (Join-Path $root 'docs\IIS-DEPLOYMENT.md') (Join-Path $pkg 'Docs')

  Write-Host '== Safety scan =='
  $bad = Get-ChildItem $pkg -Recurse -Force -File | Where-Object {
    $_.Name -match '^\.env($|\.)' -or $_.Name -like '.local-*' -or ($_.Extension -eq '.sql' -and $_.FullName -notlike '*\nhis-api\prisma\migrations\*') -or $_.Extension -in '.dump', '.backup', '.pem', '.key', '.pfx' }
  if ($bad) { $bad | ForEach-Object { Write-Error "Forbidden file in package: $($_.FullName)" }; throw 'Package contains forbidden files.' }
  $leak = Get-ChildItem $pkg -Recurse -File | Where-Object { $_.Extension -in '.js', '.html', '.config', '.xml', '.json', '.ts', '.prisma' } |
    Select-String -Pattern 'postgres(ql)?://[^:/\s<]+:[^@<\s]+@' -List
  if ($leak) { $leak | ForEach-Object { Write-Error "Possible database credential in $($_.Path)" }; throw 'Package contains a connection string with a password.' }

  Write-Host "== Creating $zip =="
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $pkg '*') -DestinationPath $zip -CompressionLevel Optimal
  $hash = (Get-FileHash $zip -Algorithm SHA256).Hash
  Set-Content -Encoding ASCII "$zip.sha256" "$hash  $(Split-Path $zip -Leaf)"
  Write-Host ("Done: {0} ({1:N1} MB)  SHA256 {2}" -f $zip, ((Get-Item $zip).Length / 1MB), $hash)
}
finally {
  Pop-Location
}
