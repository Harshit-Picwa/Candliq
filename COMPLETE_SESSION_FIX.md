# Complete Session Fix - All Issues Resolved

## Issues Found and Fixed

### 1. ✅ Missing SESSION_SECRET
- **Problem**: `.env` was missing `SESSION_SECRET`
- **Fix**: Added placeholder in `.env` (generate on EC2)

### 2. ✅ Cookie Configuration for HTTP
- **Problem**: Cookies were configured for HTTPS (`secure: true`, `sameSite: "none"`)
- **Fix**: Changed to work with HTTP (`secure: false`, `sameSite: "lax"`)

### 3. ✅ Missing CORS Middleware
- **Problem**: No CORS middleware, which can prevent cookies from working properly
- **Fix**: Added CORS middleware with `credentials: true` in `server/index.ts`

### 4. ✅ Signup Not Saving Session
- **Problem**: Signup endpoint wasn't explicitly saving session after login
- **Fix**: Added `req.session.save()` callback in signup endpoint

### 5. ✅ Nginx Not Forwarding Cookies Properly
- **Problem**: Nginx config was missing explicit cookie forwarding
- **Fix**: Added `proxy_set_header Cookie $http_cookie` and `proxy_cookie_path / /`

### 6. ✅ pdf-parse Build Error
- **Problem**: `pdf-parse` was bundled, causing `DOMMatrix` errors
- **Fix**: Removed from build allowlist

## Files Modified

1. **`.env`** - Added `SESSION_SECRET` placeholder
2. **`server/auth/auth.ts`** - Fixed cookie config and signup session saving
3. **`server/index.ts`** - Added CORS middleware
4. **`nginx.conf.ec2`** - Added cookie forwarding headers
5. **`script/build.ts`** - Removed `pdf-parse` from allowlist

## Deployment Steps on EC2

### Step 1: Connect and Navigate
```bash
ssh -i picwa-staging.pem ubuntu@3.103.97.187
cd /picwa/Candliq
```

### Step 2: Pull Latest Code
```bash
git pull origin main  # or your branch name
```

### Step 3: Generate SESSION_SECRET
```bash
SESSION_SECRET=$(openssl rand -hex 32)
sed -i '/^SESSION_SECRET=/d' .env
echo "SESSION_SECRET=$SESSION_SECRET" >> .env
cat .env | grep SESSION_SECRET  # Verify
```

### Step 4: Update Nginx Configuration
```bash
# Copy the updated nginx config
sudo cp nginx.conf.ec2 /etc/nginx/sites-available/candiq-ai

# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
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
- ✅ No `SESSION_SECRET` warnings
- ✅ No `DOMMatrix` errors
- ✅ Server status: `online` (not `errored`)

## Verification

### 1. Check Session Cookie in Browser
1. Open DevTools (F12)
2. Application → Cookies → `http://3.103.97.187`
3. After login, you should see `connect.sid` cookie with:
   - HttpOnly: ✓
   - Secure: ✗ (because HTTP)
   - SameSite: Lax
   - Path: /

### 2. Test Authentication Flow
1. **Sign Up**: Create a new account
   - Should see "Account created successfully"
   - Cookie should be set immediately
   
2. **Navigate to Dashboard**: Should work without 401 errors

3. **Refresh Page**: Should stay logged in

4. **Check API**: 
   ```bash
   curl -v http://localhost:5000/api/auth/user \
     -H "Cookie: connect.sid=YOUR_SESSION_ID"
   ```

### 3. Check Backend Logs
```bash
pm2 logs candiq-ai --lines 100 | grep -E "(SESSION_SECRET|login|signup|session|auth)"
```

Should see:
- ✅ `[signup] Session saved successfully for user: ...`
- ✅ `[login] Session saved successfully for user: ...`
- ✅ No warnings about missing SESSION_SECRET

## Troubleshooting

### Still Getting 401 Errors?

1. **Clear Browser Cookies**
   - DevTools → Application → Cookies → Delete all for `3.103.97.187`

2. **Check PM2 Status**
   ```bash
   pm2 status
   ```
   Should show `online`, not `errored`

3. **Check Nginx is Forwarding Cookies**
   ```bash
   sudo cat /etc/nginx/sites-available/candiq-ai | grep -A 2 "proxy_set_header Cookie"
   ```
   Should show: `proxy_set_header Cookie $http_cookie;`

4. **Test Direct Connection (Bypass Nginx)**
   ```bash
   curl -X POST http://localhost:5000/api/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}' \
     -c cookies.txt -v
   ```
   Check if `connect.sid` cookie is in `cookies.txt`

5. **Check Session in Database**
   ```bash
   # Connect to your database and check sessions table
   # Should see session records after login
   ```

### Cookie Not Being Set?

1. **Check Browser Console**
   - Look for cookie-related errors
   - Check Network tab → Request Headers → Cookie

2. **Verify CORS Configuration**
   ```bash
   # Check if CORS is working
   curl -v http://localhost:5000/api/auth/user \
     -H "Origin: http://3.103.97.187" \
     -H "Cookie: connect.sid=..."
   ```

3. **Check Session Store**
   - Verify `connect-pg-simple` is working
   - Check database connection

### Backend Still Crashing?

1. **Verify pdf-parse Fix**
   ```bash
   grep -v "pdf-parse" script/build.ts | grep pdf-parse
   ```
   Should return nothing (pdf-parse removed)

2. **Check Build Output**
   ```bash
   npm run build 2>&1 | grep -i error
   ```

3. **Check PM2 Logs for Errors**
   ```bash
   pm2 logs --err --lines 100
   ```

## Expected Behavior After Fix

✅ User signs up → Session created → Cookie set → User logged in  
✅ User logs in → Session created → Cookie set → User logged in  
✅ User navigates → Cookie sent → Session validated → Access granted  
✅ User refreshes → Cookie sent → Session validated → Still logged in  
✅ No 401 errors on `/api/auth/user`  
✅ No backend crashes  
✅ Sessions persist across page refreshes  

## Next Steps (Optional)

1. **Add HTTPS/SSL** (recommended for production)
   - Install Certbot: `sudo apt install certbot python3-certbot-nginx`
   - Get certificate: `sudo certbot --nginx -d your-domain.com`
   - Update `.env`: `USE_SECURE_COOKIES=true`
   - Restart: `pm2 restart all`

2. **Monitor Sessions**
   - Check session table in database periodically
   - Set up session cleanup job if needed

3. **Add Session Timeout UI**
   - Show warning before session expires
   - Auto-refresh session before timeout
