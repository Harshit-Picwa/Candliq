#!/bin/bash
# One-time bootstrap for a fresh Ubuntu EC2 instance.
#
# Usage (on EC2):
#   curl -fsSL <your-raw-url>/ec2-setup.sh -o ec2-setup.sh
#   chmod +x ec2-setup.sh
#   ./ec2-setup.sh
#
# Or if the repo is already on EC2:
#   cd /picwa/Candliq/Candiq-AI
#   chmod +x ec2-setup.sh
#   ./ec2-setup.sh

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Do not run as root. Run as 'ubuntu' with sudo available."
  exit 1
fi

echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "Installing base tooling..."
sudo apt install -y git nginx ca-certificates curl build-essential python3

echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "Installing PM2..."
sudo npm install -g pm2

echo "Creating /picwa deployment directory..."
sudo mkdir -p /picwa
sudo chown ubuntu:ubuntu /picwa

echo "Enabling and starting Nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx

echo "Done."
echo "Next: clone your repo into /picwa and run ./deploy.sh"
