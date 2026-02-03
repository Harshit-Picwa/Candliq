-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "location_city" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "location_state" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "location_country" VARCHAR(255);
