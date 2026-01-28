# How to Connect to EC2

## The Issue
SSH is asking you to verify the host fingerprint. You need to type the **full word "yes"** (not just "Y").

## Solution

When you see this prompt:
```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**Type exactly:** `yes` (lowercase, full word)

Then press Enter.

## Full Connection Command

```bash
ssh -i ~/.ssh/picwa-staging.pem ubuntu@3.103.97.187
```

When prompted, type: `yes`

## If Connection Still Fails

1. Make sure the PEM file is **not stored inside this repo**. Put it somewhere like `~/.ssh/` (Linux/Mac) or `%USERPROFILE%\.ssh\` (Windows), then use a full path:
   ```bash
   ssh -i /full/path/to/picwa-staging.pem ubuntu@3.103.97.187
   ```

2. Check file permissions (on Linux/Mac):
   ```bash
   chmod 400 ~/.ssh/picwa-staging.pem
   ```

3. On Windows, if you get permission errors:
   - Right-click `picwa-staging.pem`
   - Properties → Security
   - Give yourself "Full Control"

## After Successful Connection

Once connected, you'll see:
```
Welcome to Ubuntu...
ubuntu@ip-xxx-xxx-xxx-xxx:~$
```

Then proceed with the deployment steps!
