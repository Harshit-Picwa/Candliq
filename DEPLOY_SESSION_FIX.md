# Deploy Session Fix to EC2

This guide will help you deploy the session cookie fixes to your EC2 instance.

## Step 1: Commit and Push Changes Locally

Open PowerShell in your project directory and run:

```powershell
cd c:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Check what files changed
git status

# Stage the changes
git add server/auth/auth.ts

# Commit the changes
git commit -m "Fix session cookie issue - remove duplicate login, add session debugging"

# Push to your repository
git push
```

## Step 2: Connect to EC2

```powershell
# Navigate to folder with PEM file
cd c:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Connect to EC2 (replace YOUR_EC2_IP with your actual EC2 IP)
ssh -i picwa-staging.pem ubuntu@YOUR_EC2_IP
```

## Step 3: Pull Changes and Deploy on EC2

Once connected to EC2, run:

```bash
# Navigate to project directory
cd /home/ubuntu/Candiq-AI/Candiq-AI

# Pull latest changes
git pull

# Run deployment script
./deploy.sh
```

## Step 4: Monitor Logs

After deployment, check the logs to see if the session cookie is being set:

```bash
# View PM2 logs
pm2 logs candiq-ai --lines 50

# Or follow logs in real-time
pm2 logs candiq-ai --lines 0
```

## Step 5: Test Login

1. Open your application in a browser
2. Try logging in
3. Check the PM2 logs for:
   - `[login] Session isNew: true` (should be true after regeneration)
   - `Set-Cookie header BEFORE res.json()` (should show the cookie)
   - `Set-Cookie header AFTER res.json()` (should also show the cookie)

## Troubleshooting

If you see errors during deployment:

```bash
# Check PM2 status
pm2 status

# View detailed logs
pm2 logs candiq-ai --err --lines 100

# Restart the application
pm2 restart candiq-ai

# Check if port 5000 is in use
sudo lsof -i :5000
```

## Quick Commands Reference

```bash
# On EC2 - Quick restart after code changes
cd /home/ubuntu/Candiq-AI/Candiq-AI
git pull
npm run build
pm2 restart candiq-ai

# View logs filtered for session-related messages
pm2 logs candiq-ai | grep -i "session\|cookie\|login"

# Check if Set-Cookie header is being sent
curl -v http://localhost:5000/api/login -X POST -H "Content-Type: application/json" -d '{"email":"test@gmail.com","password":"yourpassword"}' 2>&1 | grep -i "set-cookie"
```
