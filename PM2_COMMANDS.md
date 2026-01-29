# PM2 Commands Reference

Useful PM2 commands to check and manage your application:

## Check Application Status

```bash
# Check if app is running
pm2 status

# Or shorter version
pm2 ls
```

## View Logs

```bash
# View all logs (last 50 lines)
pm2 logs candiq-ai --lines 50

# View logs in real-time (follow mode)
pm2 logs candiq-ai --lines 0

# View only error logs
pm2 logs candiq-ai --err --lines 100

# View only output logs (not errors)
pm2 logs candiq-ai --out --lines 100

# View logs filtered for specific keywords
pm2 logs candiq-ai | grep -i "session\|cookie\|login\|error"
```

## Monitor Application

```bash
# Real-time monitoring dashboard
pm2 monit

# Shows CPU, memory usage, logs, etc.
```

## Restart/Stop/Start

```bash
# Restart the application
pm2 restart candiq-ai

# Stop the application
pm2 stop candiq-ai

# Start the application
pm2 start candiq-ai

# Restart all PM2 processes
pm2 restart all
```

## Check Specific Information

```bash
# Show detailed info about the app
pm2 show candiq-ai

# Show process info (PID, memory, CPU)
pm2 info candiq-ai

# List all processes with details
pm2 list
```

## After Deployment - Check Session Cookie Fixes

```bash
# View logs filtered for session-related messages
pm2 logs candiq-ai | grep -i "session\|cookie\|login"

# Or view last 100 lines and look for:
# - "[login] Session isNew: true"
# - "Set-Cookie header BEFORE res.json()"
# - "Set-Cookie header AFTER res.json()"
pm2 logs candiq-ai --lines 100
```

## Quick Check Commands

```bash
# Quick status check
pm2 status

# Quick log view (last 20 lines)
pm2 logs candiq-ai --lines 20

# Quick restart
pm2 restart candiq-ai
```

## Save PM2 Configuration

```bash
# Save current PM2 process list (so it restarts on server reboot)
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Then run the command it outputs
```
