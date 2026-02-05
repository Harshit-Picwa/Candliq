-- AlterTable
-- Adds organization identifier for future multi-user org linking.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_website" VARCHAR;

