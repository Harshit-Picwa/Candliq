# Fix pdf-parse DOMMatrix Error

The error `ReferenceError: DOMMatrix is not defined` means `pdf-parse` is being bundled, but it uses browser APIs that don't exist in Node.js.

## Fix Steps

### Step 1: Commit and Push the Fix (on Windows)

```powershell
cd c:\Users\Lenovo\Desktop\picwa\Candiq-AI\Candiq-AI

# Stage the build fix
git add script/build.ts

# Commit
git commit -m "Fix: Explicitly mark bcrypt and pdf-parse as external modules"

# Push
git push
```

### Step 2: Rebuild on EC2

```bash
# On EC2, run:
cd /picwa/Candliq

# Pull the fix
git pull

# Clean and rebuild (this ensures pdf-parse is external)
rm -rf dist
npm run build

# Restart PM2
pm2 restart candiq-ai
```

### Step 3: Verify It's Working

```bash
# Check PM2 logs - should see no more DOMMatrix errors
pm2 logs candiq-ai --lines 30

# Check if app is running without errors
pm2 status
```

## What Changed

- Added explicit external list for `bcrypt` and `pdf-parse`
- These modules will now be loaded from `node_modules` instead of being bundled
- `pdf-parse` requires browser polyfills that don't work when bundled
- `bcrypt` is a native module that must be compiled for the target platform

## Quick Fix Command

```bash
# On EC2 - one command to fix everything:
cd /picwa/Candliq && git pull && rm -rf dist && npm run build && pm2 restart candiq-ai
```
