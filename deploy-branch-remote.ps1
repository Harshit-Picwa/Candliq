# Deploy a specific git branch to an EC2 server via SSH (run from Windows PowerShell).
#
# Example (production):
#   .\deploy-branch-remote.ps1 -HostIp 3.103.6.160 -KeyPath "$env:USERPROFILE\.ssh\picwa-production.pem" -Branch "my-branch"
#
# Notes:
# - This assumes the repo already exists on the server at -ProjectDir and has a valid .env
# - It will NOT print your .env or secrets.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$HostIp,

  [Parameter(Mandatory = $true)]
  [string]$KeyPath,

  [Parameter(Mandatory = $true)]
  [string]$Branch,

  [string]$User = "ubuntu",

  [string]$ProjectDir = "/picwa/Candliq/Candiq-AI"
)

if (!(Test-Path -LiteralPath $KeyPath)) {
  throw "PEM not found at: $KeyPath"
}

$remote = "$User@$HostIp"
$cmd = @"
set -e
cd '$ProjectDir'
if [ ! -f .env ]; then
  echo 'ERROR: .env not found in $ProjectDir (create it from .env.example first).'
  exit 1
fi
git fetch --all --prune
git checkout '$Branch'
git pull --ff-only origin '$Branch'
chmod +x ./deploy.sh
./deploy.sh
"@

Write-Host "Deploying branch '$Branch' to $remote ($ProjectDir)..."
ssh -i "$KeyPath" $remote "bash -lc $([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($cmd))"
