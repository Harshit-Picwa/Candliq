#!/bin/bash
# Optional firewall setup using UFW (run on EC2).
# Prefer opening ports in AWS Security Groups; use UFW only if you manage host firewall.
#
# Usage:
#   chmod +x ./ufw-allow-web.sh
#   ./ufw-allow-web.sh

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Do not run as root. Run as 'ubuntu' with sudo available."
  exit 1
fi

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
