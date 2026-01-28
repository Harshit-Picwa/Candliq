#!/bin/bash
# Safe helper: update DATABASE_URL in .env on EC2.
#
# Usage:
#   ./update-ec2-env.sh 'postgresql://user:password@host:5432/db'
#
# Notes:
# - This script intentionally does NOT contain any credentials.
# - Run it on the EC2 instance from the project root (or it will try a default path).

set -euo pipefail

DATABASE_URL="${1:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: Missing DATABASE_URL argument."
  echo "Usage: $0 'postgresql://user:password@host:5432/db'"
  exit 1
fi

if [ -f "./.env" ]; then
  PROJECT_DIR="$(pwd)"
elif [ -d "/picwa/Candliq/Candiq-AI" ]; then
  PROJECT_DIR="/picwa/Candliq/Candiq-AI"
else
  echo "ERROR: Could not find project directory."
  echo "Run from the project root (where .env exists), or ensure /picwa/Candliq/Candiq-AI exists."
  exit 1
fi

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env not found in $PROJECT_DIR"
  echo "Create it first: cp .env.example .env"
  exit 1
fi

# Backup current .env
cp ".env" ".env.backup.$(date +%Y%m%d_%H%M%S)"

# Update/insert DATABASE_URL without printing secrets to stdout
if grep -qE '^DATABASE_URL=' .env; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" .env
else
  printf "\nDATABASE_URL=%s\n" "$DATABASE_URL" >> .env
fi

echo "Updated DATABASE_URL in $PROJECT_DIR/.env (backup created)."
echo "Tip: test the connection with: npm run db:test"
