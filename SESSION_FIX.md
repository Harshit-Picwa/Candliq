# Session Cookie Fix - Deployment Instructions

## Issues Fixed

1. **Missing SESSION_SECRET**: The `.env` file was missing `SESSION_SECRET`, causing sessions to use an insecure default
2. **Cookie Configuration**: The session cookies were configured for HTTPS (`secure: true`, `sameSite: "none"`), but EC2 is using HTTP
3. **pdf-parse Build Error**: Removed `pdf-parse` from build allowlist to fix the `DOMMatrix` error

## Changes Made

### 1. `.env` file
- Added `SESSION_SECRET` placeholder (needs to be generated on EC2)

### 2. `server/auth/auth.ts`
- Changed cookie configuration to work with HTTP:
  - `secure: false` (since we're using HTTP, not HTTPS)
  - `sameSite: "lax"` (works with HTTP, unlike "none" which requires HTTPS)

### 3. `script/build.ts`
- Removed `pdf-parse` from allowlist so it's treated as external dependency

## Deployment Steps on EC2

### Step 1: Connect to EC2
```bash
ssh -i picwa-staging.pem ubuntu@3.103.97.187
cd /picwa/Candliq
```

### Step 2: Pull Latest Code
```bash
git pull origin main  # or your branch name
```

### Step 3: Generate SESSION_SECRET and Update .env
```bash
# Option A: Use the helper script
chmod +x fix-session-on-ec2.sh
./fix-session-on-ec2.sh

# Option B: Manual method
SESSION_SECRET=$(openssl rand -hex 32)
sed -i '/^SESSION_SECRET=/d' .env
echo "SESSION_SECRET=$SESSION_SECRET" >> .env
cat .env | grep SESSION_SECRET  # Verify it was added
```

### Step 4: Fix pdf-parse Build Issue
```bash
# Remove pdf-parse from build allowlist (if not already done)
sed -i '/"pdf-parse",/d' script/build.ts
```

### Step 5: Clean Rebuild
```bash
rm -rf dist node_modules
npm install
npm run build
```

### Step 6: Restart PM2
```bash
pm2 delete all
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

### Step 7: Check Logs
```bash
pm2 logs --lines 50
```

Look for:
- ✅ `[auth] SESSION_SECRET` should NOT show a warning
- ✅ Server should start without `DOMMatrix` errors
- ✅ No more `errored` status in PM2

### Step 8: Test in Browser
1. Open `http://3.103.97.187`
2. Sign up or log in
3. Check browser DevTools → Application → Cookies
4. You should see `connect.sid` cookie with:
   - `HttpOnly: ✓`
   - `Secure: ✗` (because we're using HTTP)
   - `SameSite: Lax`
5. Navigate to `/dashboard` - should work without 401 errors

## Verification

### Check Session Cookie in Browser
1. Open DevTools (F12)
2. Go to Application → Cookies → `http://3.103.97.187`
3. Find `connect.sid` cookie
4. Verify:
   - Cookie exists
   - HttpOnly is checked
   - Secure is NOT checked (because HTTP)
   - SameSite is "Lax"

### Check Backend Logs
```bash
pm2 logs candiq-ai --lines 100 | grep -E "(SESSION_SECRET|login|session|auth)"
```

Should see:
- No warnings about missing SESSION_SECRET
- Successful login messages
- Session saved messages

## Troubleshooting

### Still Getting 401 Errors?
1. **Clear browser cookies**: Delete all cookies for `3.103.97.187`
2. **Check PM2 status**: `pm2 status` - should show `online`, not `errored`
3. **Check logs**: `pm2 logs --lines 100` for errors
4. **Verify SESSION_SECRET**: `grep SESSION_SECRET .env` should show a long hex string
5. **Test API directly**: 
   ```bash
   curl -X POST http://localhost:5000/api/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}'
   ```

### Cookie Not Being Set?
1. Check browser console for cookie errors
2. Verify Nginx is not stripping cookies (check `/etc/nginx/sites-available/candiq-ai`)
3. Check if `trust proxy` is set: `app.set("trust proxy", 1)` in `server/auth/auth.ts`

### Backend Still Crashing?
1. Check if `pdf-parse` was removed from `script/build.ts`
2. Verify clean rebuild: `rm -rf dist node_modules && npm install && npm run build`
3. Check PM2 logs: `pm2 logs --lines 100`

## Future: Adding HTTPS

When you add SSL/HTTPS to your EC2 instance:

1. Update `.env`:
   ```bash
   USE_SECURE_COOKIES=true
   ```

2. Update `server/auth/auth.ts` cookie config will automatically use:
   - `secure: true`
   - `sameSite: "none"`

3. Restart: `pm2 restart all`
