$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $sourceRoot
try {
  foreach ($step in @(@('ci'), @('run', 'db:generate'), @('run', 'typecheck'), @('run', 'build'))) {
    & npm @step
    if ($LASTEXITCODE -ne 0) { throw "Build step failed: npm $step" }
  }
  Write-Host 'Build complete. Review migrations and configure persistent uploads before deployment.'
} finally { Pop-Location }
