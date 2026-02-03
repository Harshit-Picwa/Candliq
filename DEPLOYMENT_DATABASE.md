# Database setup after deployment

After you push code that includes **schema/migration changes** (e.g. new columns like location), the **live database** must be updated and the app must use a **new Prisma client**.

## What already runs on deploy

If you use `./deploy.sh` on the server, it already:

1. Runs `npm run db:generate` (Prisma client)
2. Runs `npm run db:migrate:deploy` (apply migrations to DB)
3. Runs `npm run build` (which now also runs `prisma generate`)

So in normal deployments, the DB and client are updated automatically.

## If "create project" (or other DB ops) fail on live

Usually the live DB is missing new columns because migrations were not applied. Do this **on the server** (e.g. SSH into EC2):

```bash
cd /picwa/Candliq   # or your project path

# 1. Ensure .env has correct DATABASE_URL for production
# 2. Apply all pending migrations to the live database
npm run db:migrate:deploy

# 3. Regenerate Prisma client (in case it was built without new schema)
npm run db:generate

# 4. Rebuild and restart the app
npm run build
pm2 restart all
```

## If a migration is "stuck" (e.g. 0_init failed)

If `prisma migrate deploy` says a migration failed and blocks the rest:

- If the DB **already has** the tables from that migration, mark it as applied:
  ```bash
  npx prisma migrate resolve --applied "0_init"
  npm run db:migrate:deploy
  ```
- Then rebuild and restart as above.

## One-off: apply migrations only (no full deploy)

From the server, in the project directory:

```bash
npm run db:migrate:deploy
npm run db:generate
pm2 restart all
```

This updates the database schema and Prisma client, then restarts the app so it uses the new schema.
