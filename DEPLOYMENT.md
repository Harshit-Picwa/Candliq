# EC2 Deployment Guide

This guide will help you deploy the Candiq-AI application on an AWS EC2 instance.

## Prerequisites

- AWS EC2 instance (Ubuntu 22.04 LTS recommended)
- PEM file for SSH access
- Server details (IP address, username)
- PostgreSQL database (can be on EC2 or external like Supabase)

## Step 1: Connect to Your EC2 Instance

```bash
# On Windows (PowerShell)
ssh -i path/to/your-key.pem ubuntu@your-ec2-ip

# On Linux/Mac
chmod 400 path/to/your-key.pem
ssh -i path/to/your-key.pem ubuntu@your-ec2-ip
```

## Step 2: Initial Server Setup

### Update system packages
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js (v20.x recommended)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Verify installation
```

### Install PostgreSQL (if using local database)
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### Install Nginx (for reverse proxy)
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Install Git
```bash
sudo apt install -y git
```

## Step 3: Clone and Setup Application

### Clone your repository
```bash
cd /home/ubuntu
git clone <your-repository-url> Candiq-AI
cd Candiq-AI/Candiq-AI
```

### Install dependencies
```bash
npm install
```

### Generate Prisma Client
```bash
npm run db:generate
```

## Step 4: Configure Environment Variables

Create a `.env` file:
```bash
nano .env
```

Add your environment variables (use the template from `.env.example`):
```env
DATABASE_HOST=your-database-host
DATABASE_PORT=5432
DATABASE_USER=your-database-user
DATABASE_PASSWORD=your-database-password
DATABASE_NAME=your-database-name
DATABASE_URL=postgresql://user:password@host:port/database

OPENAI_API_KEY=your-openai-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key

CLEAR_SESSIONS_ON_START=false

PORT=5000
NODE_ENV=production
```

**Important:** 
- Never commit `.env` to git
- Use strong passwords in production
- Consider using AWS Secrets Manager for sensitive data

## Step 5: Database Setup

### Run migrations
```bash
npm run db:migrate:deploy
```

This will apply all database migrations to your production database.

## Step 6: Build the Application

```bash
npm run build
```

This will:
- Build the React frontend
- Bundle the Express server
- Output everything to the `dist` folder

## Step 7: Configure PM2

PM2 will keep your application running and restart it if it crashes.

### Start the application with PM2
```bash
pm2 start ecosystem.config.js
```

### Save PM2 configuration
```bash
pm2 save
pm2 startup
# Follow the instructions to enable PM2 on system boot
```

### Useful PM2 commands
```bash
pm2 status              # Check application status
pm2 logs                # View logs
pm2 logs --lines 100    # View last 100 lines
pm2 restart all         # Restart application
pm2 stop all            # Stop application
pm2 delete all          # Remove from PM2
```

## Step 8: Configure Nginx (Reverse Proxy)

Nginx will handle incoming HTTP requests and forward them to your Node.js application.

### Create Nginx configuration
```bash
sudo nano /etc/nginx/sites-available/candiq-ai
```

Add the configuration (see `nginx.conf` in the project root for the full config).

### Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/candiq-ai /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Step 9: Configure Firewall (UFW)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Step 10: SSL Certificate (Optional but Recommended)

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain SSL certificate
```bash
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically configure Nginx for HTTPS.

## Step 11: Verify Deployment

1. Check PM2 status: `pm2 status`
2. Check application logs: `pm2 logs`
3. Check Nginx status: `sudo systemctl status nginx`
4. Visit your domain or EC2 public IP in a browser

## Troubleshooting

### Application won't start
```bash
pm2 logs                    # Check for errors
npm run db:test            # Test database connection
cat .env                    # Verify environment variables
```

### Database connection issues
- Verify DATABASE_URL is correct
- Check database firewall/security groups
- Ensure database is accessible from EC2

### Port already in use
```bash
sudo lsof -i :5000         # Check what's using port 5000
pm2 delete all             # Stop PM2 processes
```

### Permission issues
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/Candiq-AI
```

## Updating the Application

When you need to deploy updates:

```bash
cd /home/ubuntu/Candiq-AI/Candiq-AI
git pull origin main
npm install
npm run db:generate
npm run build
pm2 restart all
```

## Monitoring

### View real-time logs
```bash
pm2 logs --lines 50
```

### Monitor resources
```bash
pm2 monit
```

### Check system resources
```bash
htop
df -h  # Disk space
free -h  # Memory
```

## Security Best Practices

1. **Keep system updated**: `sudo apt update && sudo apt upgrade`
2. **Use strong passwords**: Especially for database
3. **Enable firewall**: UFW is configured above
4. **Use HTTPS**: SSL certificate via Certbot
5. **Regular backups**: Backup database regularly
6. **Monitor logs**: Check PM2 and Nginx logs regularly
7. **Limit SSH access**: Consider using key-based auth only
8. **Environment variables**: Never commit `.env` to git

## Backup Strategy

### Database backup
```bash
# For PostgreSQL
pg_dump -h your-host -U your-user -d your-database > backup.sql

# Restore
psql -h your-host -U your-user -d your-database < backup.sql
```

### Application backup
```bash
tar -czf candiq-ai-backup-$(date +%Y%m%d).tar.gz /home/ubuntu/Candiq-AI
```

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
