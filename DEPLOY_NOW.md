# 🚀 DEPLOY NOW - Step by Step

Follow these steps in order to deploy your application to EC2.

## Your EC2 Details
- **Host**: 3.103.97.187
- **User**: ubuntu
- **Key**: picwa-staging.pem (store outside this repo, e.g. in `~/.ssh/` or `%USERPROFILE%\\.ssh\\`)
- **Path**: /picwa/Candliq

---

## STEP 1: Connect to EC2

### On Windows (PowerShell):
```powershell
# Connect to EC2
ssh -i "$env:USERPROFILE\.ssh\picwa-staging.pem" ubuntu@3.103.97.187
```

**If you get permission errors**, right-click the PEM file → Properties → Security → Give yourself full control.

---

## STEP 2: Install Prerequisites (One-time only)

Once connected to EC2, run these commands:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Nginx (Web Server)
sudo apt install -y nginx

# Install Git (if not already installed)
sudo apt install -y git

# Create deployment directory
sudo mkdir -p /picwa
sudo chown ubuntu:ubuntu /picwa
```

---

## STEP 3: Transfer Your Code to EC2

### Option A: Using Git (Recommended - if your code is in a Git repository)

On EC2:
```bash
cd /picwa
git clone <your-repository-url> Candliq
cd Candliq/Candiq-AI
```

### Option B: Using SCP from Windows (If not using Git)

**On your Windows machine** (open a NEW PowerShell window, keep EC2 connected):

```powershell
# Navigate to your project folder
cd C:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Transfer all files to EC2
scp -i "$env:USERPROFILE\.ssh\picwa-staging.pem" -r . ubuntu@3.103.97.187:/picwa/Candliq/Candiq-AI/
```

**Then back on EC2:**
```bash
cd /picwa/Candliq/Candiq-AI
```

---

## STEP 4: Setup Environment Variables

On EC2:
```bash
cd /picwa/Candliq/Candiq-AI

# Copy the example file
cp .env.example .env

# Edit the .env file
nano .env
```

**In the nano editor**, update these values with your production credentials:

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

**To save in nano:**
- Press `Ctrl+X`
- Press `Y` (yes)
- Press `Enter`

---

## STEP 5: Deploy the Application

On EC2:
```bash
cd /picwa/Candliq/Candiq-AI

# Make deploy script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

This script will:
- ✅ Install all dependencies
- ✅ Generate Prisma Client
- ✅ Run database migrations
- ✅ Build the application
- ✅ Start the app with PM2

**Wait for it to complete!** You should see "✅ Deployment completed successfully!"

---

## STEP 6: Configure Nginx (Web Server)

On EC2:
```bash
cd /picwa/Candliq/Candiq-AI

# Copy the pre-configured nginx file
sudo cp nginx.conf.ec2 /etc/nginx/sites-available/candiq-ai

# Enable the site
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/

# Remove default nginx site
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

---

## STEP 7: Setup Firewall

On EC2:
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

---

## STEP 8: Verify Deployment ✅

### Check if application is running:
```bash
pm2 status
```

You should see `candiq-ai` with status `online`.

### Check application logs:
```bash
pm2 logs
```

### Test if app responds:
```bash
curl http://localhost:5000
```

### Check Nginx status:
```bash
sudo systemctl status nginx
```

---

## STEP 9: Access Your Application 🌐

Open your browser and visit:
```
http://3.103.97.187
```

**If it doesn't work:**
1. Check AWS Security Group - make sure port 80 is open
2. Check PM2 logs: `pm2 logs`
3. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

---

## Common Issues & Fixes

### Issue: "Permission denied" when connecting
**Fix:** Right-click PEM file → Properties → Security → Give yourself full control

### Issue: "Port 5000 already in use"
**Fix:**
```bash
pm2 delete all
cd /picwa/Candliq
./deploy.sh
```

### Issue: "Database connection failed"
**Fix:**
- Check your `.env` file has correct DATABASE_URL
- Verify database is accessible from EC2 (check security groups if using AWS RDS)
- Test connection: `npm run db:test`

### Issue: "Cannot find module"
**Fix:**
```bash
cd /picwa/Candliq/Candiq-AI
npm install
npm run db:generate
./deploy.sh
```

---

## Updating Your Application (Future Deployments)

When you make changes and want to deploy updates:

```bash
# Connect to EC2
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187

# Navigate to project
cd /picwa/Candliq/Candiq-AI

# Pull latest code (if using Git)
git pull

# OR transfer new files using SCP from Windows

# Deploy updates
./deploy.sh
```

---

## Useful Commands Reference

```bash
# PM2 Commands
pm2 status              # Check app status
pm2 logs                # View logs
pm2 logs --lines 100    # Last 100 lines
pm2 restart all         # Restart app
pm2 stop all            # Stop app
pm2 monit               # Monitor resources

# Nginx Commands
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t           # Test config

# Database
cd /picwa/Candliq/Candiq-AI
npm run db:test         # Test connection
npm run db:migrate:deploy  # Run migrations
```

---

## ✅ Deployment Checklist

- [ ] Connected to EC2
- [ ] Installed Node.js, PM2, Nginx
- [ ] Transferred code to `/picwa/Candliq/Candiq-AI`
- [ ] Created `.env` file with production values
- [ ] Ran `./deploy.sh` successfully
- [ ] Configured Nginx
- [ ] Setup firewall
- [ ] Verified PM2 status shows app as "online"
- [ ] Can access app at http://3.103.97.187

---

**Need help?** Check the logs:
- Application logs: `pm2 logs`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- System logs: `journalctl -u nginx`
