#!/bin/bash
# Quick connect script for Linux/Mac
# Make executable: chmod +x connect-ec2.sh
# Recommended: keep your PEM outside the repo, e.g. ~/.ssh/

echo "Connecting to EC2 instance..."
HOST="${2:-3.103.97.187}"
USER="${3:-ubuntu}"
echo "Host: $HOST"
echo "User: $USER"
echo ""

PEM_PATH="${1:-$HOME/.ssh/picwa-staging.pem}"
if [ ! -f "$PEM_PATH" ]; then
  echo "ERROR: PEM file not found at: $PEM_PATH"
  echo "Usage:"
  echo "  ./connect-ec2.sh"
  echo "  ./connect-ec2.sh /full/path/to/picwa-staging.pem"
  echo "  ./connect-ec2.sh /full/path/to/picwa-production.pem 3.103.6.160 ubuntu"
  exit 1
fi

chmod 400 "$PEM_PATH" 2>/dev/null || true
ssh -i "$PEM_PATH" "$USER@$HOST"
