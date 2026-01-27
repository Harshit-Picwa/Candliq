# Deploying from Windows to EC2

This guide helps you deploy from a Windows machine to EC2.

## Prerequisites

- Windows PowerShell or Command Prompt
- Your PEM file
- EC2 instance details (IP address, username - usually `ubuntu`)

## Step 1: Connect to EC2 via SSH

### Using PowerShell
```powershell
# Navigate to folder containing your PEM file
cd C:\path\to\your\pem\file

# Connect to EC2
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### Using PuTTY (Alternative)
1. Download PuTTY and PuTTYgen
2. Convert PEM to PPK using PuTTYgen
3. Use PuTTY to connect with the PPK file

## Step 2: Transfer Files to EC2

### Option A: Using SCP (PowerShell/Command Prompt)

```powershell
# From your local machine, navigate to project root
cd C:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Transfer files (excluding node_modules and dist)
scp -i path\to\your-key.pem -r . ubuntu@your-ec2-ip:/home/ubuntu/Candiq-AI/
```

### Option B: Using Git (Recommended)

On EC2:
```bash
cd /home/ubuntu
git clone <your-repository-url> Candiq-AI
cd Candiq-AI/Candiq-AI
```

### Option C: Using WinSCP (GUI Tool)

1. Download WinSCP
2. Connect using your PEM file
3. Drag and drop files to `/home/ubuntu/Candiq-AI/`

## Step 3: Setup on EC2

Once connected to EC2, follow the deployment steps:

```bash
# Install prerequisites (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y nginx git

# Navigate to project
cd /home/ubuntu/Candiq-AI/Candiq-AI

# Create .env file
nano .env
# Paste your environment variables and save (Ctrl+X, Y, Enter)

# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

## Step 4: Configure Nginx

```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/candiq-ai

# Edit to replace 'your-domain.com' with your domain or IP
sudo nano /etc/nginx/sites-available/candiq-ai

# Enable site
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: Setup Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Updating Your Application

### Method 1: Using Git (Recommended)

On EC2:
```bash
cd /home/ubuntu/Candiq-AI/Candiq-AI
git pull
./deploy.sh
```

### Method 2: Manual Transfer

On Windows (PowerShell):
```powershell
# From project directory
scp -i path\to\your-key.pem -r . ubuntu@your-ec2-ip:/home/ubuntu/Candiq-AI/Candiq-AI/
```

Then on EC2:
```bash
cd /home/ubuntu/Candiq-AI/Candiq-AI
./deploy.sh
```

## Troubleshooting Windows-Specific Issues

### Permission Denied on PEM File
```powershell
# Right-click PEM file → Properties → Security
# Remove inheritance and grant yourself full control
```

### SSH Connection Timeout
- Check EC2 Security Group: Ensure port 22 is open
- Verify PEM file path is correct
- Check EC2 instance is running

### File Transfer Issues
- Use Git instead of SCP for better reliability
- Ensure you're in the correct directory
- Check file paths don't have spaces

## Quick Reference

### Connect to EC2
```powershell
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### Transfer Single File
```powershell
scp -i your-key.pem file.txt ubuntu@your-ec2-ip:/home/ubuntu/
```

### Transfer Directory
```powershell
scp -i your-key.pem -r folder ubuntu@your-ec2-ip:/home/ubuntu/
```

### Check Application Status (on EC2)
```bash
pm2 status
pm2 logs
```
