# Quick EC2 Deployment Reference

## Initial Setup (One-time)

### 1. Connect to EC2
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### 2. Install Prerequisites
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install -y nginx

# Git
sudo apt install -y git
```

### 3. Clone and Setup
```bash
cd /home/ubuntu
git clone <your-repo-url> Candiq-AI
cd Candiq-AI/Candiq-AI

# Copy .env.example to .env and edit it
cp .env.example .env
nano .env  # Add your actual values

# Make deploy script executable
chmod +x deploy.sh
```

### 4. Run Deployment
```bash
./deploy.sh
```

### 5. Setup Nginx
```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/candiq-ai

# Edit the config to replace 'your-domain.com' with your domain/IP
sudo nano /etc/nginx/sites-available/candiq-ai

# Enable site
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Setup Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Updating the Application

```bash
cd /home/ubuntu/Candiq-AI/Candiq-AI
git pull
./deploy.sh
```

## Common Commands

```bash
# PM2
pm2 status              # Check status
pm2 logs                # View logs
pm2 restart all         # Restart app
pm2 stop all            # Stop app

# Nginx
sudo systemctl status nginx
sudo systemctl reload nginx
sudo nginx -t           # Test config

# Database
npm run db:migrate:deploy
npm run db:test         # Test connection
```

## Troubleshooting

```bash
# Check if app is running
pm2 status

# Check logs
pm2 logs --lines 100

# Check port
sudo lsof -i :5000

# Test database connection
npm run db:test

# Restart everything
pm2 restart all
sudo systemctl reload nginx
```
