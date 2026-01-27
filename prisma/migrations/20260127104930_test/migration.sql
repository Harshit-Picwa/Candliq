/*
  Warnings:

  - The primary key for the `sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "company_website" VARCHAR,
ADD COLUMN     "interview_duration" INTEGER,
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR;

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey",
ALTER COLUMN "sid" SET DATA TYPE VARCHAR,
ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ADD COLUMN     "password_hash" VARCHAR,
ALTER COLUMN "id" SET DATA TYPE VARCHAR,
ALTER COLUMN "email" SET DATA TYPE VARCHAR,
ALTER COLUMN "first_name" SET DATA TYPE VARCHAR,
ALTER COLUMN "last_name" SET DATA TYPE VARCHAR,
ALTER COLUMN "profile_image_url" SET DATA TYPE VARCHAR,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
