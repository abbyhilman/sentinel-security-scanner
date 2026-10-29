[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$TargetRepo,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path
if (-not (Test-Path -LiteralPath (Join-Path $targetRoot '.git'))) {
  throw 'TargetRepo must point to an existing Git repository.'
}

$files = @(
  @{ Source = 'sentinel-scan.yml'; Destination = '.github/workflows/sentinel-scan.yml' }
  @{ Source = 'sentinel-runner.mjs'; Destination = '.github/sentinel/sentinel-runner.mjs' }
  @{ Source = 'gitleaks.toml'; Destination = '.github/sentinel/gitleaks.toml' }
  @{ Source = 'rules/sentinel-security.yml'; Destination = '.github/sentinel/rules/sentinel-security.yml' }
  @{ Source = 'rules/manifest.json'; Destination = '.github/sentinel/rules/manifest.json' }
  @{ Source = 'rules/LICENSE'; Destination = '.github/sentinel/rules/LICENSE' }
  @{ Source = 'THIRD_PARTY_NOTICES.md'; Destination = '.github/sentinel/THIRD_PARTY_NOTICES.md' }
)

$copyPlan = foreach ($file in $files) {
  $source = Join-Path $PSScriptRoot $file.Source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Template file is missing: $source"
  }

  $destination = Join-Path $targetRoot $file.Destination
  $parentPath = $targetRoot
  foreach ($directory in ((Split-Path -Parent $file.Destination) -split '[\\/]+')) {
    $parentPath = Join-Path $parentPath $directory
    if (Test-Path -LiteralPath $parentPath) {
      $parent = Get-Item -LiteralPath $parentPath -Force
      if (-not $parent.PSIsContainer) {
        throw "A file blocks the template directory: $parentPath"
      }
      if (($parent.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to write through a linked template directory: $parentPath"
      }
    }
  }

  $same = $false
  if (Test-Path -LiteralPath $destination) {
    $existing = Get-Item -LiteralPath $destination -Force
    if ($existing.PSIsContainer) {
      throw "A directory blocks the template file: $destination"
    }
    if (($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to replace a linked template file: $destination"
    }
    $same = (Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $destination).Hash
    if (-not $same -and -not $Force) {
      throw "File already exists and differs: $destination. Review it or rerun with -Force to replace it."
    }
  }

  @{ Source = $source; Destination = $destination; Same = $same }
}

foreach ($file in $copyPlan) {
  if ($file.Same) { continue }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file.Destination) | Out-Null
  Copy-Item -LiteralPath $file.Source -Destination $file.Destination -Force
}

Write-Host "Seven Sentinel workflow files are ready in $targetRoot."
Write-Host 'Review the changes, then commit and push them from the target repository.'
