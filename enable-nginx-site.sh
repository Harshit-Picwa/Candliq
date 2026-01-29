#!/bin/bash
# Enable Nginx reverse proxy for this app (run on EC2).
#
# Usage:
#   cd /picwa/Candliq/Candiq-AI
#   chmod +x ./enable-nginx-site.sh
#   ./enable-nginx-site.sh

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Do not run as root. Run as 'ubuntu' with sudo available."
  exit 1
fi

if [ ! -f "./nginx.conf.ec2" ]; then
  echo "ERROR: nginx.conf.ec2 not found in current directory."
  exit 1
fi

sudo cp ./nginx.conf.ec2 /etc/nginx/sites-available/candiq-ai
sudo ln -sf /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/candiq-ai
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "Nginx configured and reloaded."
