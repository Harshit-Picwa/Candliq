# Candiq-AI Codebase - Quick Summary

## Project Overview
AI-powered interview assistant platform for HR professionals. Enables structured, competency-based interviews with real-time transcription, AI-generated questions, and automated evaluation reports.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend**: Express + TypeScript + Prisma + PostgreSQL
- **AI**: OpenAI GPT-5.1 (should be Gemini 2.5 Pro)
- **Real-time**: WebSocket for audio transcription
- **Auth**: Local development authentication

## Architecture
- **Monorepo**: client/ | server/ | shared/
- **Database**: PostgreSQL with Prisma ORM
- **State**: TanStack React Query
- **Routing**: Wouter

## Key Features (Implemented)
✅ Project management (create, edit, delete)
✅ AI question generation from job descriptions
✅ Real-time audio transcription (WebSocket)
✅ Live interview cockpit (3-column layout)
✅ AI follow-up suggestions
✅ Automated interview reports
✅ Competency-based scoring

## Missing Features (14 total)
### Phase 1: Context Setup
- ❌ PDF upload & parsing
- ❌ Gemini 2.5 Pro integration (currently OpenAI)
- ❌ 10-15 questions generation (currently 4-6 competencies × 2-3)
- ❌ Re-prompt functionality

### Phase 2: Cockpit
- ❌ Speaker diarization (all marked as "candidate")
- ❌ Answer quality evaluation
- ❌ Context-aware suggestions (with quotes)
- ❌ Question-answer pair tracking

### Phase 3: Report
- ❌ "Strong Hire" recommendation
- ❌ Evidence with direct quotes
- ❌ Rubric-based evaluation
- ❌ Overall score calculation

## Code Quality
**Strengths:**
- ✅ Full TypeScript coverage
- ✅ Modern React patterns
- ✅ Clear architecture
- ✅ Professional UI

**Weaknesses:**
- ⚠️ No tests
- ⚠️ Limited error recovery
- ⚠️ No request validation middleware
- ⚠️ No rate limiting

## File Structure
```
client/src/
  ├── pages/          # 8 pages (dashboard, cockpit, report, etc.)
  ├── components/     # 50+ UI components
  └── hooks/          # Custom hooks

server/
  ├── routes.ts       # API + WebSocket
  ├── services/      # AI services (gemini.ts, whisper.ts)
  └── storage.ts     # Database layer

shared/
  └── schema.ts      # TypeScript interfaces
```

## API Endpoints
- Projects: CRUD + generate-questions
- Interviews: CRUD + end (generates report)
- WebSocket: `/api/interviews/:id/audio` (real-time transcription)

## Database Schema
- `users` - User accounts
- `projects` - Hiring projects with JD and questions (JSONB)
- `interviews` - Candidate interviews with transcript/report (JSONB)
- `sessions` - PostgreSQL session storage

## Next Steps
1. Switch to Gemini 2.5 Pro
2. Implement PDF upload
3. Add speaker diarization
4. Enhance report generation
5. Add testing
6. Improve error handling

---
**See CODEBASE_ANALYSIS_UPDATED.md for detailed analysis**
