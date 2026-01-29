# Fix Git Merge Conflict on EC2

You have unmerged files from a previous merge attempt. Here's how to fix it:

## Option 1: Abort Merge and Start Fresh (Recommended)

This cancels the merge and lets you pull cleanly:

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Abort the current merge
git merge --abort

# Check status
git status

# Now stash any local changes
git stash

# Pull fresh
git pull

# Deploy
./deploy.sh
```

## Option 2: Resolve Conflicts Manually

If you want to keep some local changes:

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Check which files have conflicts
git status

# For each conflicted file, you can:
# - Accept remote version (from GitHub):
git checkout --theirs package.json
git checkout --theirs package-lock.json
git checkout --theirs script/build.ts

# - Or accept local version (on EC2):
# git checkout --ours package.json

# After resolving conflicts, mark them as resolved:
git add package.json package-lock.json script/build.ts

# Complete the merge
git commit -m "Resolve merge conflicts"

# Now deploy
./deploy.sh
```

## Option 3: Reset Everything and Pull Fresh (Nuclear Option)

If you don't care about any local changes on EC2:

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Abort merge
git merge --abort

# Reset to match remote exactly (WARNING: loses all local changes)
git reset --hard origin/main

# Pull fresh
git pull

# Deploy
./deploy.sh
```

## Recommended: Use Option 1

This is the safest - it aborts the merge, stashes local changes, and pulls fresh:

```bash
cd /picwa/Candliq
git merge --abort
git stash
git pull
./deploy.sh
```
