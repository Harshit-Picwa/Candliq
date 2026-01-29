#!/bin/bash
# Deploy a specific git branch on an EC2 box (run THIS on the EC2 instance).
#
# Usage:
#   ./deploy-branch-on-ec2.sh <branch>
#
# Requirements:
# - Repo already cloned on the instance
# - .env already configured
# - You run this from the project root: /picwa/Candliq/Candiq-AI

set -euo pipefail

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "ERROR: Missing branch name."
  echo "Usage: $0 <branch>"
  exit 1
fi

if [ ! -f "package.json" ] || [ ! -f "deploy.sh" ]; then
  echo "ERROR: Run this from the project root (where package.json and deploy.sh exist)."
  exit 1
fi

echo "Fetching latest refs..."
git fetch --all --prune

echo "Checking out branch: $BRANCH"
git checkout "$BRANCH"

echo "Pulling latest for: $BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Running deploy script..."
chmod +x ./deploy.sh
./deploy.sh

echo "Done. Check status with: pm2 status && pm2 logs"
