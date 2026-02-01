#!/bin/bash

# EC2 Deployment Script for Candiq-AI
# This script automates the deployment process on EC2
# Run from project root: ./deploy.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting Candiq-AI deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Please do not run as root${NC}"
   exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 not found. Installing PM2...${NC}"
    sudo npm install -g pm2
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}.env file not found. Please create it with your environment variables.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"

# Install dependencies
echo "📦 Installing dependencies..."
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npm run db:generate

# Run database migrations
echo "🗄️  Running database migrations..."
npm run db:migrate:deploy

# Build the application
echo "🏗️  Building application..."
npm run build

# Create logs directory
mkdir -p logs

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 processes..."
pm2 delete candiq-ai 2>/dev/null || true

# Start application with PM2
echo "▶️  Starting application with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs            - View application logs"
echo "  pm2 restart all     - Restart application"
echo "  pm2 monit           - Monitor application"
