# Fix Native Module Build Error

The error `No native build was found for platform=linux` means `bcrypt` was bundled but needs to be installed natively on Linux.

## Fix Steps

### Step 1: Commit and Push the Fix (on Windows)

```powershell
cd c:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Stage the build fix
git add script/build.ts

# Commit
git commit -m "Fix: Remove bcrypt from bundle - native module must be external"

# Push
git push
```

### Step 2: Rebuild on EC2

```bash
# On EC2, run:
cd /picwa/Candliq

# Pull the fix
git pull

# Rebuild the application (this will install bcrypt natively for Linux)
npm run build

# Restart PM2
pm2 restart candiq-ai
```

### Step 3: Verify It's Working

```bash
# Check PM2 logs - should see no more native build errors
pm2 logs candiq-ai --lines 20

# Check status
pm2 status
```

## Why This Happened

- `bcrypt` is a native module (written in C++)
- Native modules must be compiled for the specific platform (Linux in this case)
- esbuild cannot bundle native modules - they must be installed separately
- By removing `bcrypt` from the allowlist, it becomes "external" and will be installed from `node_modules` instead of being bundled

## Quick Fix Command

```bash
# On EC2 - one command to fix everything:
cd /picwa/Candliq && git pull && npm run build && pm2 restart candiq-ai
```
