# Push meditation project to GitHub (overwrite remote main)
# Usage: .\scripts\push-github.ps1 -RepoUrl "https://github.com/YOUR_USER/meditation.git"

param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".git")) {
  Write-Error "Run from project root after git init."
}

git remote remove origin 2>$null
git remote add origin $RepoUrl

Write-Host "Pushing to $RepoUrl (force main)..."
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
  Write-Host "Done. Repo: $($RepoUrl -replace '\.git$','')"
} else {
  Write-Host "Push failed. Run: gh auth login"
  exit 1
}
