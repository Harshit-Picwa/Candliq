-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "intro_minutes" INTEGER;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "closure_minutes" INTEGER;
