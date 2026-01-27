# Database Setup Guide

## Recommended: Supabase (Free Tier)

**Supabase is the recommended database solution for this project.** It provides a fully managed PostgreSQL database with a generous free tier, automatic backups, and easy scaling.

### Quick Setup Steps

1. **Sign up for Supabase**
   - Go to https://supabase.com and create an account
   - Click "New Project"
   - Fill in your project details (name, database password, region)
   - Wait for the project to be provisioned (takes ~2 minutes)

2. **Get your connection string**
   - Go to **Settings** → **Database**
   - Scroll down to **Connection string** section
   - Select **URI** format
   - Copy the connection string
   - It will look like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

3. **Update your `.env` file**
   ```env
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with the database password you set when creating the project.

4. **Run migrations**
   ```bash
   npm run db:migrate
   ```

### Supabase Benefits

- ✅ **Free tier**: 500MB database, 2GB bandwidth, unlimited API requests
- ✅ **Automatic backups**: Daily backups included
- ✅ **Real-time capabilities**: Built-in real-time subscriptions (if needed later)
- ✅ **Built-in auth**: Can integrate Supabase Auth later if desired
- ✅ **PostgreSQL compatible**: Works seamlessly with Prisma and all existing code
- ✅ **No local setup**: No need to install PostgreSQL locally

### Supabase Connection Pooling (Optional)

For production or high-traffic scenarios, Supabase recommends using connection pooling. You can use the **Session mode** connection string from the Supabase dashboard, which uses port `6543` instead of `5432`. This helps manage database connections more efficiently.

---

## Alternative Options

### Option 2: Neon (Free Tier)
1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string from the dashboard
4. Paste it into your `.env` file as `DATABASE_URL`

### Option 3: Local PostgreSQL

#### Install PostgreSQL on Windows
1. Download from: https://www.postgresql.org/download/windows/
2. Run the installer
3. **Remember the password** you set for the `postgres` user
4. Keep the default port (5432)

#### Create Database
1. Open **pgAdmin** (comes with PostgreSQL) or use command line:
2. Connect to PostgreSQL server
3. Right-click **Databases** → **Create** → **Database**
4. Name it: `candiq_ai`
5. Click **Save**

#### Update .env File
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/candiq_ai
```

Replace `YOUR_PASSWORD` with the password you set during installation.

## After Setting Up Database

1. Update your `.env` file with the correct `DATABASE_URL`
2. Run the migration:
   ```bash
   npm run db:migrate
   ```

## Troubleshooting

### "password authentication failed"
- Make sure you're using the correct password
- Check that the username is correct (usually `postgres` for local)
- Verify the database name exists

### "connection refused" or "could not connect"
- Make sure PostgreSQL service is running
- Check the host and port are correct
- For cloud databases, check firewall/network settings

### "database does not exist"
- Create the database first (see Option 2 above)
- Or use the default `postgres` database for testing
