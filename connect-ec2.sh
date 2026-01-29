#!/bin/bash
# Quick connect script for Linux/Mac
# Make executable: chmod +x connect-ec2.sh
# Recommended: keep your PEM outside the repo, e.g. ~/.ssh/picwa-staging.pem

echo "Connecting to EC2 instance..."
echo "Host: 3.103.97.187"
echo "User: ubuntu"
echo ""

PEM_PATH="${1:-$HOME/.ssh/picwa-staging.pem}"
if [ ! -f "$PEM_PATH" ]; then
  echo "ERROR: PEM file not found at: $PEM_PATH"
  echo "Usage:"
  echo "  ./connect-ec2.sh"
  echo "  ./connect-ec2.sh /full/path/to/picwa-staging.pem"
  exit 1
fi

chmod 400 "$PEM_PATH" 2>/dev/null || true
ssh -i "$PEM_PATH" ubuntu@3.103.97.187
