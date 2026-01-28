# Quick Start - Deploy to Your EC2 Instance

## Your EC2 Details
- **Host**: 3.103.97.187
- **User**: ubuntu
- **Key**: picwa-staging.pem (store outside this repo, e.g. in `~/.ssh/` or `%USERPROFILE%\.ssh\`)
- **Path**: /picwa/Candliq

## Step 1: Connect to EC2

### Windows PowerShell
```powershell
ssh -i "$env:USERPROFILE\.ssh\picwa-staging.pem" ubuntu@3.103.97.187
```

### Linux/Mac
```bash
chmod 400 ~/.ssh/picwa-staging.pem
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187
```

## Step 2: One-Time Setup (Run Once)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Create directory
sudo mkdir -p /picwa
sudo chown ubuntu:ubuntu /picwa
```

## Step 3: Transfer Your Code

### Option A: Using Git (Recommended)
```bash
cd /picwa
git clone <your-repo-url> Candliq
cd Candliq/Candiq-AI
```

### Option B: Using SCP from Windows
From your Windows machine:
```powershell
cd C:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI
scp -i "$env:USERPROFILE\.ssh\picwa-staging.pem" -r . ubuntu@3.103.97.187:/picwa/Candliq/Candiq-AI/
```

Then on EC2:
```bash
cd /picwa/Candliq/Candiq-AI
```

## Step 4: Setup Environment

```bash
cd /picwa/Candliq/Candiq-AI

# Create .env file
cp .env.example .env
nano .env
# Add your production values and save (Ctrl+X, Y, Enter)
```

## Step 5: Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

## Step 6: Setup Nginx

```bash
# Copy and edit nginx config
sudo cp nginx.conf /etc/nginx/sites-available/candiq-ai
sudo nano /etc/nginx/sites-available/candiq-ai
# Replace 'your-domain.com' with '3.103.97.187'

# Enable site
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default
sudo nginx -t
sudo systemctl reload nginx
```

## Step 7: Setup Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Verify

Visit: **http://3.103.97.187**

Check status:
```bash
pm2 status
pm2 logs
```

## Update Application (When Needed)

```bash
cd /picwa/Candliq/Candiq-AI
git pull  # or transfer new files
./deploy.sh
```

## Quick Commands

```bash
# Connect
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187

# Navigate
cd /picwa/Candliq/Candiq-AI

# Deploy
./deploy.sh

# Check status
pm2 status
pm2 logs

# Restart
pm2 restart all
```
