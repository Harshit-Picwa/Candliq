# Database Setup Guide

## Quick Setup Options

### Option 1: Free Cloud Database (Recommended - Easiest)

#### Using Supabase (Free Tier)
1. Go to https://supabase.com and sign up
2. Create a new project
3. Go to **Settings** → **Database**
4. Copy the **Connection string** (URI format)
5. It will look like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`
6. Paste it into your `.env` file as `DATABASE_URL`

#### Using Neon (Free Tier)
1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string from the dashboard
4. Paste it into your `.env` file as `DATABASE_URL`

### Option 2: Local PostgreSQL

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
