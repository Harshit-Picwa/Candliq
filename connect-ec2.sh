#!/bin/bash
# Quick connect script for Linux/Mac
# Make executable: chmod +x connect-ec2.sh

echo "Connecting to EC2 instance..."
echo "Host: 3.103.97.187"
echo "User: ubuntu"
echo ""

ssh -i picwa-staging.pem ubuntu@3.103.97.187
