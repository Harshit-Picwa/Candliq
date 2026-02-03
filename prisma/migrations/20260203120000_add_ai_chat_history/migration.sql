-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ai_chat_history" JSONB;
