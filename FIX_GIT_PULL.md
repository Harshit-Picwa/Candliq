# Fix Git Pull Conflict on EC2

You have local changes on EC2 that conflict with the pull. Here's how to fix it:

## Option 1: Stash Local Changes (Recommended)

This saves your local changes temporarily, pulls the updates, then you can decide if you need them:

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Stash local changes (saves them temporarily)
git stash

# Now pull the latest changes
git pull

# Check what was stashed (optional - to see what changes were saved)
git stash list

# If you need those stashed changes back later, you can apply them:
# git stash pop
```

## Option 2: Discard Local Changes (If they're not important)

If the local changes on EC2 are not important (like dependency updates that will be reinstalled anyway):

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Discard local changes to those specific files
git checkout -- package-lock.json package.json script/build.ts

# Now pull the latest changes
git pull
```

## Option 3: Commit Local Changes First

If you want to keep the local changes:

```bash
# On EC2, run these commands:
cd /picwa/Candliq

# Add the changed files
git add package-lock.json package.json script/build.ts

# Commit them
git commit -m "EC2 local changes"

# Now pull (may require merge)
git pull
```

## Recommended: Use Option 1 (Stash)

Since these are likely just dependency/build changes that will be regenerated during deployment, stashing is safest:

```bash
cd /picwa/Candliq
git stash
git pull
./deploy.sh
```

The `deploy.sh` script will reinstall dependencies and rebuild anyway, so the stashed changes are likely not needed.
