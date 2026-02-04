-- AlterTable
-- NOTE: `status` was missing from the initial `projects` table on some environments.
-- Use IF NOT EXISTS to avoid failing on databases where it already exists.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';

