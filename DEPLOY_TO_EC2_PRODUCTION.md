# Deploy a Branch to Production EC2 (3.103.6.160)

## Production Server Details
- **Host**: `3.103.6.160`
- **User**: `ubuntu`
- **Key**: `picwa-production.pem` (recommended location: `%USERPROFILE%\.ssh\picwa-production.pem` on Windows, `~/.ssh/picwa-production.pem` on Linux/Mac)
- **Project path on server**: `/picwa/Candliq/Candiq-AI`
- **App port**: `5000` (Nginx proxies port 80 → 5000)

> Security note: keeping `.pem` files inside the repo is risky. Prefer storing them outside the repo and ignoring `*.pem` (already configured).

## 1) Connect to production

### Windows PowerShell
```powershell
ssh -i "$env:USERPROFILE\.ssh\picwa-production.pem" ubuntu@3.103.6.160
```

### Linux/Mac
```bash
chmod 400 ~/.ssh/picwa-production.pem
ssh -i ~/.ssh/picwa-production.pem ubuntu@3.103.6.160
```

## 2) One-time server setup (run once)
On the EC2 instance:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y nginx git
sudo mkdir -p /picwa
sudo chown ubuntu:ubuntu /picwa
```

Optional (if you have the repo already on the server):
```bash
cd /picwa/Candliq/Candiq-AI
chmod +x ./ec2-setup.sh
./ec2-setup.sh
```

## 3) Clone the repo (first deploy only)
```bash
cd /picwa
git clone <your-repo-url> Candliq
cd /picwa/Candliq/Candiq-AI
```

## 4) Configure environment (.env)
```bash
cd /picwa/Candliq/Candiq-AI
cp .env.example .env
nano .env
```

Set at least:
- `DATABASE_URL=...`
- `OPENAI_API_KEY=...`
- `GOOGLE_AI_API_KEY=...`
- `NODE_ENV=production`
- `PORT=5000`

## 5) Deploy a specific branch on production

### Option A (recommended): run on the EC2 instance
```bash
cd /picwa/Candliq/Candiq-AI
chmod +x ./deploy-branch-on-ec2.sh
./deploy-branch-on-ec2.sh <your-branch-name>
```

### Option B: trigger from Windows PowerShell (remote deploy)
```powershell
cd C:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI
.\deploy-branch-remote.ps1 -HostIp 3.103.6.160 -KeyPath "$env:USERPROFILE\.ssh\picwa-production.pem" -Branch "<your-branch-name>"
```

## 6) Nginx reverse proxy (one-time)
On EC2:
```bash
cd /picwa/Candliq/Candiq-AI
chmod +x ./enable-nginx-site.sh
./enable-nginx-site.sh
```

If you want, edit `/etc/nginx/sites-available/candiq-ai` and set:
- `server_name 3.103.6.160;` (or your domain)

## 7) Open ports / verify
- Ensure your **AWS Security Group** allows inbound: `22`, `80` (and `443` if using HTTPS).
- Optional host firewall (UFW) on EC2:
  ```bash
  cd /picwa/Candliq/Candiq-AI
  chmod +x ./ufw-allow-web.sh
  ./ufw-allow-web.sh
  ```

On EC2:
```bash
pm2 status
pm2 logs
curl http://localhost:5000
sudo systemctl status nginx
```

Then visit:
- `http://3.103.6.160`
