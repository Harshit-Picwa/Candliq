-- Migration: Add Phase 1 Fields
-- Created: 2025-01-27
-- Description: Adds company_website, interview_duration to projects, and password_hash to users

-- Add password_hash to users table
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "password_hash" varchar;

-- Add company_website and interview_duration to projects table
ALTER TABLE "projects" 
ADD COLUMN IF NOT EXISTS "company_website" varchar,
ADD COLUMN IF NOT EXISTS "interview_duration" integer DEFAULT 30;
