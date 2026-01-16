# Candiq.AI

## Overview

Candiq.AI is an AI-powered interview assistant platform designed for HR professionals and recruiters. It enables users to conduct SME-quality (Subject Matter Expert) interviews for any role by providing intelligent question generation, real-time interview assistance with live transcription, and structured candidate evaluation reports.

The application follows a project-based workflow where users create hiring projects, upload job descriptions, generate competency-based screening questions using AI, conduct interviews with real-time transcription and AI suggestions, and produce comprehensive evaluation reports.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with custom plugins for Replit integration
- **Design System**: Modern SaaS productivity aesthetic (Linear + Notion influence) with custom CSS variables for theming (light/dark mode support)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints under `/api/*` prefix
- **Real-time Communication**: WebSocket server for live interview features (transcription streaming)
- **Session Management**: Express sessions with PostgreSQL store via connect-pg-simple

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**:
  - `users` and `sessions` - Authentication (Replit Auth integration)
  - `projects` - Hiring projects with job descriptions and generated competencies
  - `interviews` - Individual candidate interviews with transcripts and reports
  - `conversations` and `messages` - Chat/voice conversation storage

### Authentication
- **Provider**: Replit Auth via OpenID Connect
- **Session Storage**: PostgreSQL-backed sessions with 1-week TTL
- **Implementation**: Passport.js with custom OIDC strategy in `server/replit_integrations/auth/`

### AI Services Integration
- **LLM (via Replit AI Integrations)**: Primary LLM for competency extraction, question generation, follow-up suggestions, and interview report generation. Uses OpenAI SDK with `gpt-5.1` model through `AI_INTEGRATIONS_OPENAI_BASE_URL` (`server/services/gemini.ts`)
- **OpenAI Whisper**: Audio transcription for interview recording (`server/services/whisper.ts`)
- **Note**: All AI services use Replit AI Integrations which provides API access without requiring your own API keys. Charges are billed to Replit credits.

### Project Structure
```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Route-based page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities and providers
│   └── replit_integrations/  # Audio playback utilities
├── server/           # Express backend
│   ├── services/     # AI service integrations
│   ├── replit_integrations/  # Auth, chat, audio, image modules
│   └── routes.ts     # API route definitions
├── shared/           # Shared types and schema
│   ├── schema.ts     # Drizzle database schema
│   └── models/       # Additional model definitions
└── migrations/       # Drizzle migration files
```

## External Dependencies

### AI Services (via Replit AI Integrations)
- **LLM (gpt-5.1)**: Competency extraction, question generation, interview suggestions, report generation
- **OpenAI Whisper**: Audio transcription for live interview recording
- **Environment Variables Required** (auto-configured by Replit):
  - `AI_INTEGRATIONS_OPENAI_API_KEY` - API key for LLM and Whisper
  - `AI_INTEGRATIONS_OPENAI_BASE_URL` - Base URL for AI services

### Database
- **PostgreSQL**: Primary data store
- **Environment Variable**: `DATABASE_URL`

### Authentication
- **Replit OIDC**: Identity provider
- **Environment Variables**:
  - `ISSUER_URL` (defaults to `https://replit.com/oidc`)
  - `REPL_ID`
  - `SESSION_SECRET`

### Key NPM Packages
- `@google/genai` - Google Generative AI SDK
- `openai` - OpenAI API client
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Server state management
- `@radix-ui/*` - Headless UI primitives for shadcn/ui
- `ws` - WebSocket support for real-time features