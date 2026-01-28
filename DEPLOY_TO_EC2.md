# Deploy Candiq-AI to EC2 - Specific Instructions

## Your EC2 Details
- **Host**: 3.103.97.187
- **User**: ubuntu
- **Key**: picwa-staging.pem (store outside this repo, e.g. in `~/.ssh/` or `%USERPROFILE%\\.ssh\\`)
- **Deployment Path**: /picwa/Candliq

## Step 1: Connect to EC2

### From Windows PowerShell
```powershell
# Connect to EC2
ssh -i "$env:USERPROFILE\.ssh\picwa-staging.pem" ubuntu@3.103.97.187
```

### From Linux/Mac
```bash
chmod 400 ~/.ssh/picwa-staging.pem
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187
```

## Step 2: Initial Server Setup (One-time)

Once connected to EC2, run:

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

# Install Git (if not already installed)
sudo apt install -y git

# Create deployment directory
sudo mkdir -p /picwa
sudo chown ubuntu:ubuntu /picwa
```

## Step 3: Transfer Your Application

### Option A: Using Git (Recommended)

On EC2:
```bash
cd /picwa
git clone <your-repository-url> Candliq
cd Candliq/Candiq-AI
```

### Option B: Using SCP from Windows

From your Windows machine (PowerShell):
```powershell
# Navigate to your project root
cd C:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Transfer files to EC2
scp -i "$env:USERPROFILE\.ssh\picwa-staging.pem" -r . ubuntu@3.103.97.187:/picwa/Candliq/Candiq-AI/
```

Then on EC2:
```bash
cd /picwa/Candliq/Candiq-AI
```

## Step 4: Setup Environment Variables

```bash
cd /picwa/Candliq/Candiq-AI

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

Add your production values:
```env
DATABASE_HOST=your-database-host
DATABASE_PORT=5432
DATABASE_USER=your-database-user
DATABASE_PASSWORD=your-database-password
DATABASE_NAME=Candliq-Ai
DATABASE_URL=postgresql://user:password@host:port/database

OPENAI_API_KEY=your-openai-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key

PORT=5000
NODE_ENV=production
CLEAR_SESSIONS_ON_START=false
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

## Step 5: Deploy Application

```bash
cd /picwa/Candliq/Candiq-AI

# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
- Install dependencies
- Generate Prisma Client
- Run database migrations
- Build the application
- Start with PM2

## Step 6: Configure Nginx

```bash
# Copy nginx configuration
sudo cp nginx.conf.ec2 /etc/nginx/sites-available/candiq-ai

# Edit configuration
sudo nano /etc/nginx/sites-available/candiq-ai
```

Replace `your-domain.com` with `3.103.97.187` or your domain name.

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Step 7: Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Step 8: Verify Deployment

```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs

# Check if app is responding
curl http://localhost:5000

# Check Nginx status
sudo systemctl status nginx
```

Visit `http://3.103.97.187` in your browser to see your application.

## Updating the Application

When you need to deploy updates:

```bash
# Connect to EC2
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187

# Navigate to project
cd /picwa/Candliq/Candiq-AI

# Pull latest changes (if using Git)
git pull

# Or transfer new files using SCP, then:
cd /picwa/Candliq/Candiq-AI

# Run deployment
./deploy.sh
```

## Useful Commands

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs                # View logs
pm2 logs --lines 100    # Last 100 lines
pm2 restart all         # Restart app
pm2 stop all            # Stop app
pm2 monit               # Monitor resources
```

### Nginx Commands
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo nginx -t           # Test config
```

### Database Commands
```bash
cd /picwa/Candliq/Candiq-AI
npm run db:test         # Test connection
npm run db:migrate:deploy  # Run migrations
```

## Troubleshooting

### Application won't start
```bash
cd /picwa/Candliq/Candiq-AI
pm2 logs
cat .env                # Verify environment variables
npm run db:test        # Test database connection
```

### Port already in use
```bash
sudo lsof -i :5000
pm2 delete all
cd /picwa/Candliq/Candiq-AI
./deploy.sh
```

### Permission issues
```bash
sudo chown -R ubuntu:ubuntu /picwa/Candliq
```

### Check if services are running
```bash
pm2 status
sudo systemctl status nginx
```

## SSL Certificate Setup (Optional)

If you have a domain name pointing to your EC2 instance:

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Quick Reference

### Connect to EC2
```bash
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187
```

### Navigate to project
```bash
cd /picwa/Candliq/Candiq-AI
```

### Deploy/Update
```bash
./deploy.sh
```

### View logs
```bash
pm2 logs
```

### Restart app
```bash
pm2 restart all
```
