# Fix Permission Denied Error

The `deploy.sh` script doesn't have execute permissions. Fix it with:

## Quick Fix

```bash
# On EC2, run:
cd /picwa/Candliq

# Make the script executable
chmod +x deploy.sh

# Now run it
./deploy.sh
```

## Alternative: Run with bash directly

If you don't want to change permissions, you can run it with bash:

```bash
cd /picwa/Candliq
bash deploy.sh
```

## Check Current Permissions

To see current permissions:

```bash
ls -l deploy.sh
```

You should see something like:
- `-rw-r--r--` = not executable (needs chmod +x)
- `-rwxr-xr-x` = executable (good!)
