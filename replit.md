# Candiq.AI - Interview Assistant

## Overview
Candiq.AI is a full-stack web application that helps HR professionals and recruiters run SME-quality (Subject Matter Expert) interviews. It generates screening questions, provides real-time suggestions during interviews, and creates structured evaluation reports.

## Project Architecture
- **Frontend**: React 18 with Vite, TailwindCSS, Shadcn UI components, wouter for routing
- **Backend**: Express.js server (TypeScript) serving both API and frontend on port 5000
- **Database**: PostgreSQL with Prisma ORM
- **AI Services**: Google Gemini (primary AI) and OpenAI Whisper (audio transcription)
- **Auth**: Passport.js with local strategy, express-session with pg session store

## Project Structure
```
client/           - React frontend
  src/
    components/   - UI components
    pages/        - Page components (landing, login, dashboard, etc.)
    hooks/        - Custom hooks (auth, toast, mobile detection)
    lib/          - Utilities (query client, auth utils, theme)
server/           - Express backend
  auth/           - Authentication (passport, routes, storage)
  services/       - AI services (gemini, whisper, pdf-parser)
  middleware/     - Upload middleware
shared/           - Shared types and schemas
  schema.ts       - TypeScript types
  models/         - Auth and chat models
prisma/           - Prisma schema and migrations
```

## Key Configuration
- Server binds to `0.0.0.0:5000` (non-Windows) for Replit compatibility
- Vite dev server runs in middleware mode with `allowedHosts: true`
- Prisma handles database schema and migrations
- AI API keys (GOOGLE_AI_API_KEY, OPENAI_API_KEY) are optional - app starts without them but AI features require them

## Running the Project
- **Development**: `npm run dev` (starts Express + Vite dev server)
- **Production Build**: `npm run build` (builds frontend with Vite, bundles server with esbuild)
- **Production Start**: `npm run start`
- **Database Migrations**: `npx prisma migrate deploy`

## Recent Changes
- 2026-02-06: AI prompt optimized to generate shorter, more focused questions (3-4 min each instead of 6-7) to maximize question count within screening time budget. All three prompt builders (main, first-batch, subsequent-batch) updated consistently.
- 2026-02-06: Frontend time display fix - replaced hardcoded complexity-based TIME_ESTIMATES (simple=2.0/moderate=2.5/complex=3.0) with actual AI-generated estimatedMinutes per question. All displays (badges, totals, AI analysis modal, breakdowns) now show real AI estimates. Frontend and backend time calculations are now consistent.
- 2026-02-06: Backend precision improvements - smart time budget enforcement preserving competency coverage, auto-complexity assignment, time clamping (0.5-6.0 min), gap-filling to maximize screening time utilization, totalMinutes passed to generation for adaptive buffer sizing, demoted overflow questions become buffers instead of being discarded
- 2026-02-06: Removed hardcoded TIME_ESTIMATES (2.0/2.5/3.0 min) - AI now dynamically estimates time per question based on actual complexity and scope. Updated Gemini model to gemini-2.5-pro with gemini-2.5-flash and gemini-2.0-flash fallbacks.
- 2026-02-06: Initial Replit setup - configured database, installed dependencies, fixed OpenAI client initialization to be lazy (prevents crash when API key not set)
