# Fix: Dashboard Showing Instead of Login Page

## Problem
When starting the server, the dashboard page appears instead of the login page, even when the user is not authenticated.

## Root Cause
Stale session cookies in the browser are making the server think the user is authenticated.

## Solution Applied

### 1. Enhanced Session Validation
- Added middleware to validate sessions on every request
- Sessions are automatically cleared if the user doesn't exist in the database
- Added better logging to debug authentication issues

### 2. Improved Frontend Redirect Logic
- Added immediate redirect from `/` to `/login` when not authenticated
- Added redirect from `/login` to `/dashboard` when authenticated
- Added console logging for debugging

### 3. Better Error Handling
- `/api/auth/user` endpoint now properly returns `null` when not authenticated
- Frontend properly handles all error cases

## Steps to Fix the Issue

### Option 1: Clear Browser Cookies (Recommended)
1. Open your browser's Developer Tools (F12)
2. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Under **Cookies**, select `http://localhost:5000`
4. Delete the `connect.sid` cookie
5. Refresh the page

### Option 2: Use Incognito/Private Window
1. Open a new incognito/private browser window
2. Navigate to `http://localhost:5000`
3. You should now see the login page

### Option 3: Clear All Sessions (Database)
If you have database access, you can clear all sessions:
```sql
DELETE FROM sessions;
```

### Option 4: Use Debug Endpoint
1. Navigate to `http://localhost:5000/api/auth/debug`
2. Check if `isAuthenticated` is `true` when it shouldn't be
3. If needed, call `POST /api/auth/force-logout` to clear your session

## Testing
After clearing cookies:
1. Start the server: `npm run dev`
2. Navigate to `http://localhost:5000`
3. You should see the **login page**, not the dashboard
4. If you see the dashboard, check the browser console for authentication logs

## Files Modified
- `client/src/App.tsx` - Improved redirect logic
- `client/src/hooks/use-auth.ts` - Better error handling
- `server/auth/auth.ts` - Session validation middleware
- `server/auth/routes.ts` - Improved `/api/auth/user` endpoint

## Debugging
Check the server console for these log messages:
- `[auth/user] Checking authentication...`
- `[auth/user] User not authenticated, returning 401`
- `[App] Redirecting unauthenticated user to /login from: /`

If you see `[auth/user] User found, returning user data` when you shouldn't be authenticated, there's a stale session cookie that needs to be cleared.

---

## Auth hygiene (local dev / "replit" auto-login)

If a **local dev** user seems to auto-login when the server starts (e.g. leftover from Replit or local scripts):

1. **Remove dev users**  
   `DELETE /api/auth/remove-dev-users?email=dev@localhost`  
   Removes any `dev@localhost` users from the DB. The app blocks creating them; this cleans up existing ones.

2. **Auto-delete on startup**  
   Set `AUTO_DELETE_DEV_USER=true` in `.env`. The auth layer will delete `dev@localhost` on startup if found.

3. **Clear sessions**  
   Stale `connect.sid` cookies or DB sessions can make it look like you’re logged in. Clear cookies (see above) or run:
   ```sql
   DELETE FROM sessions;
   ```

4. **Force logout**  
   `POST /api/auth/force-logout` (when authenticated) clears your session.

5. **Clear-session redirect**  
   Open `/?logout=true` to clear session and redirect to login.

Use these when debugging “dashboard instead of login” or unexpected dev-user logins.
