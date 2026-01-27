# Sprint Checklist: All Changes & Missing Features

## Overview
This document lists ALL changes and missing features needed to complete Phases 1, 2, and 3 of the Candiq-AI project.

---

## 🔴 CRITICAL: Environment Setup (Must Fix First)

### Missing Environment Variables
- ❌ `.env` file does not exist
- ❌ `DATABASE_URL` - PostgreSQL connection string
- ❌ `SESSION_SECRET` - Session encryption key
- ❌ `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (currently causing server crash)
- ❌ `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL
- ❌ `GOOGLE_AI_API_KEY` - Google AI API key (needed for Phase 1)

**Action Required:** Create `.env` file in project root with all required variables.

---

## 📋 Phase 1: Context Setup (Pre-Interview)

### 1. PDF Upload & Parsing
**Status:** ❌ Not Implemented

**Backend Changes:**
- [ ] Create `server/services/pdf-parser.ts`
  - [ ] Install `pdf-parse` or `pdfjs-dist` package
  - [ ] Implement `extractTextFromPDF(buffer: Buffer): Promise<string>`
  - [ ] Add PDF validation function

- [ ] Create `server/middleware/upload.ts`
  - [ ] Install `multer` and `@types/multer` packages
  - [ ] Configure multer for PDF file uploads (10MB max)
  - [ ] Add file type validation (PDF only)

- [ ] Add endpoint in `server/routes.ts`
  - [ ] POST `/api/projects/:id/upload-jd`
  - [ ] Accept multipart/form-data with PDF file
  - [ ] Extract text from PDF
  - [ ] Store in `jdText` field
  - [ ] Return updated project

**Frontend Changes:**
- [ ] Update `client/src/pages/project-setup.tsx`
  - [ ] Add file upload UI component
  - [ ] Add drag-and-drop support
  - [ ] Show upload progress
  - [ ] Display extracted text preview
  - [ ] Handle upload errors

**Dependencies to Install:**
```bash
npm install pdf-parse @types/multer
# multer already in build.ts allowlist
```

---

### 2. Switch to Gemini 2.5 Pro
**Status:** ❌ Currently using OpenAI GPT-5.1

**Backend Changes:**
- [ ] Update `server/services/gemini.ts`
  - [ ] Replace OpenAI import with `@google/genai`
  - [ ] Initialize `GoogleGenerativeAI` client
  - [ ] Update `extractCompetenciesAndQuestions()` to use Gemini
  - [ ] Update `generateFollowUpSuggestions()` to use Gemini
  - [ ] Update `generateInterviewReport()` to use Gemini
  - [ ] Handle Gemini API errors appropriately

**Environment Variables:**
- [ ] Add `GOOGLE_AI_API_KEY` to `.env`

**Dependencies:**
- ✅ `@google/genai` already installed (but not used)

**Code Changes:**
```typescript
// Replace this:
import OpenAI from "openai";
const openai = new OpenAI({...});

// With this:
import { GoogleGenerativeAI } from "@google/genai";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
```

---

### 3. Update Question Generation (10-15 Questions)
**Status:** ❌ Currently generates 4-6 competencies × 2-3 questions (8-18 total)

**Backend Changes:**
- [ ] Update `server/services/gemini.ts` - `extractCompetenciesAndQuestions()`
  - [ ] Change prompt from "4-6 competencies, 2-3 questions each"
  - [ ] To: "Generate exactly 10-15 screening questions total"
  - [ ] Adjust competency extraction (3-5 competencies instead of 4-6)
  - [ ] Ensure questions are well-distributed across competencies
  - [ ] Add validation to ensure question count is 10-15

**Prompt Changes:**
```
OLD: "Extract 4-6 key competencies... For each competency, generate 2-3 questions"
NEW: "Extract 3-5 key competencies... Generate exactly 10-15 screening questions total, distributed across competencies"
```

---

### 4. Re-Prompt Functionality
**Status:** ❌ Not Implemented

**Backend Changes:**
- [ ] Add function in `server/services/gemini.ts`
  - [ ] Create `regenerateQuestionsWithInstructions()` function
  - [ ] Accept `jdText`, `smeNotes`, `customInstructions` parameters
  - [ ] Append custom instructions to base prompt
  - [ ] Call Gemini with enhanced prompt
  - [ ] Return new questions

- [ ] Add endpoint in `server/routes.ts`
  - [ ] POST `/api/projects/:id/regenerate-questions`
  - [ ] Accept `{ customInstructions?: string }` in body
  - [ ] Call `regenerateQuestionsWithInstructions()`
  - [ ] Update project with new questions
  - [ ] Return updated project

**Frontend Changes:**
- [ ] Update `client/src/pages/questions-setup.tsx`
  - [ ] Replace "Regenerate" button with "Re-Prompt" button
  - [ ] Add dialog/modal component
  - [ ] Add textarea for custom instructions
  - [ ] Add examples (e.g., "Make questions harder", "Focus on culture fit")
  - [ ] Show loading state during regeneration
  - [ ] Handle success/error states
  - [ ] Preserve existing questions if user cancels

---

### 5. Enhance Question Review UI
**Status:** ⚠️ Partially Implemented (has editing, missing indicators)

**Frontend Changes:**
- [ ] Update `client/src/pages/questions-setup.tsx`
  - [ ] Add visual indicator for edited vs AI-generated questions
    - [ ] Show badge/icon for edited questions
    - [ ] Track which questions were manually edited
  - [ ] Add "Approve" button to finalize question list
    - [ ] Mark questions as approved
    - [ ] Disable further editing (or show warning)
  - [ ] Display question count (should show "X / 10-15 questions")
  - [ ] Add validation to ensure question count is 10-15
    - [ ] Show warning if outside range
    - [ ] Prevent approval if count is wrong

**Data Model Changes:**
- [ ] Update `ScreeningQuestion` interface (optional)
  - [ ] Add `isEdited?: boolean` field
  - [ ] Add `isApproved?: boolean` field

---

### 6. Database Schema Updates (Optional)
**Status:** ⚠️ Not Required, but Recommended

**Optional Changes:**
- [ ] Add `jdSource` field to `Project` model
  - [ ] Type: `"pdf" | "text" | null`
  - [ ] Track how JD was uploaded
- [ ] Add `jdFileName` field to `Project` model
  - [ ] Type: `string | null`
  - [ ] Store original PDF filename

**Files to Modify:**
- [ ] `prisma/schema.prisma` - Add fields
- [ ] Run `prisma migrate dev` to create migration
- [ ] Update `server/storage.ts` - Handle new fields

---

## 🎙️ Phase 2: The Cockpit (Live Interview)

### 7. Speaker Diarization
**Status:** ❌ All transcript entries marked as "candidate"

**Backend Changes:**
- [ ] Update `server/routes.ts` - `setupAudioWebSocket()` function
  - [ ] Add `detectSpeaker()` helper function
  - [ ] Implement heuristic speaker detection:
    - [ ] First entry in conversation = interviewer
    - [ ] If last speaker was candidate, next = interviewer
    - [ ] Question patterns = interviewer ("Tell me", "Can you", etc.)
    - [ ] Default: alternate or candidate
  - [ ] Update transcript entry creation to use detected speaker
  - [ ] Store speaker in `TranscriptEntry.speaker` field

**Code to Add:**
```typescript
function detectSpeaker(
  text: string,
  transcript: TranscriptEntry[]
): "interviewer" | "candidate" {
  // Implementation
}
```

---

### 8. Answer Quality Evaluation
**Status:** ❌ Not Implemented

**Backend Changes:**
- [ ] Add function in `server/services/gemini.ts`
  - [ ] Create `evaluateAnswerQuality()` function
  - [ ] Accept: `question`, `candidateAnswer`, `fullTranscript`
  - [ ] Evaluate against question's rubric (strong/weak signals)
  - [ ] Return: quality, score, signals found, reasoning

- [ ] Update `server/routes.ts` - `setupAudioWebSocket()`
  - [ ] Track current question being asked
  - [ ] Detect when candidate finishes answering
  - [ ] Call `evaluateAnswerQuality()` after answer
  - [ ] Send evaluation via WebSocket

**New Interface:**
```typescript
interface AnswerEvaluation {
  quality: "strong" | "moderate" | "weak";
  score: number; // 1-5
  signals: {
    strong: string[];
    weak: string[];
  };
  reasoning: string;
}
```

**WebSocket Message Type:**
- [ ] Add `answer_evaluation` message type
  - [ ] Include questionId, entryId, quality, score, signals, reasoning

---

### 9. Context-Aware Follow-up Suggestions
**Status:** ⚠️ Partially Implemented (generic suggestions exist)

**Backend Changes:**
- [ ] Enhance `server/services/gemini.ts` - `generateFollowUpSuggestions()`
  - [ ] Extract most recent candidate answer
  - [ ] Extract specific terms/concepts mentioned
  - [ ] Identify gaps or vague areas
  - [ ] Generate follow-ups that reference what candidate said
  - [ ] Include quote from candidate's answer in suggestion

**Update Interface:**
- [ ] Update `AISuggestion` in `shared/schema.ts`
  - [ ] Add `contextQuote?: string` field
  - [ ] Add `mentionedTopics?: string[]` field

**Enhanced Prompt:**
```
CANDIDATE JUST SAID: "[exact quote]"
CONTEXT: They mentioned [topics], claimed [claims], areas to probe [gaps]
Generate follow-up that references what they said...
```

---

### 10. Question-Answer Pair Tracking
**Status:** ❌ Not Implemented

**Backend Changes:**
- [ ] Update `server/routes.ts` - `setupAudioWebSocket()`
  - [ ] Track `currentQuestionId` in WebSocket session
  - [ ] Detect when interviewer asks a question
    - [ ] Match transcript text to question text
    - [ ] Set `currentQuestionId`
  - [ ] Collect candidate's answer entries
  - [ ] When answer completes, create question-answer pair
  - [ ] Store pairs for report generation

**New Interface:**
- [ ] Add `QuestionAnswerPair` to `shared/schema.ts`
```typescript
interface QuestionAnswerPair {
  questionId: string;
  questionText: string;
  answerTranscript: TranscriptEntry[];
  evaluation?: AnswerEvaluation;
  timestamp: number;
}
```

---

### 11. Real-time Answer Quality UI
**Status:** ❌ Not Implemented

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-cockpit.tsx`
  - [ ] Add quality badge next to transcript entries
    - [ ] Green badge for "strong"
    - [ ] Yellow badge for "moderate"
    - [ ] Red badge for "weak"
  - [ ] Color-code transcript entries based on quality
  - [ ] Display detected strong/weak signals inline
  - [ ] Show evaluation score (1-5) for each answer
  - [ ] Add tooltip showing evaluation reasoning

**WebSocket Handler:**
- [ ] Handle `answer_evaluation` message type
- [ ] Update transcript entry with evaluation data
- [ ] Trigger UI update

---

### 12. Enhanced Suggestion Display
**Status:** ⚠️ Partially Implemented (basic suggestions exist)

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-cockpit.tsx`
  - [ ] Show quote from candidate's answer in suggestion card
  - [ ] Highlight mentioned topics/concepts
  - [ ] Display context-aware reasoning
  - [ ] Add "Ask this" button that copies question to clipboard
  - [ ] Improve visual design of suggestion cards

**UI Enhancements:**
- [ ] Add quote block with citation
- [ ] Show mentioned topics as badges
- [ ] Make reasoning more prominent

---

### 13. Manual Question Marking
**Status:** ❌ Not Implemented

**Backend Changes:**
- [ ] Add endpoint in `server/routes.ts`
  - [ ] POST `/api/interviews/:id/mark-question`
  - [ ] Accept `{ questionId: string }` in body
  - [ ] Set current question in WebSocket session
  - [ ] Return confirmation

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-cockpit.tsx`
  - [ ] Add "I just asked a question" button
  - [ ] Add keyboard shortcut (e.g., Ctrl+Q)
  - [ ] Show visual indicator of current question
  - [ ] Display which question is being answered

---

### 14. Audio Processing Optimization
**Status:** ⚠️ Partially Implemented (5-second batching exists)

**Backend Changes:**
- [ ] Update `server/routes.ts` - `setupAudioWebSocket()`
  - [ ] Reduce processing interval from 5s to 2-3s
  - [ ] Add pause detection for complete thoughts
  - [ ] Implement sentence boundary detection
  - [ ] Buffer audio to capture complete sentences

**Optional Enhancements:**
- [ ] Use streaming transcription if Whisper API supports it
- [ ] Implement adaptive batching based on audio activity

---

## 📊 Phase 3: The Report (Post-Interview)

### 15. Add "Strong Hire" Recommendation
**Status:** ❌ Currently only Hire/No-Hire/Hold

**Backend Changes:**
- [ ] Update `shared/schema.ts`
  - [ ] Change `InterviewReport.recommendation.decision` type
  - [ ] From: `"Hire" | "No-Hire" | "Hold"`
  - [ ] To: `"Strong Hire" | "Hire" | "No-Hire" | "Hold"`

- [ ] Update `server/services/gemini.ts` - `generateInterviewReport()`
  - [ ] Update prompt to include "Strong Hire" option
  - [ ] Update parsing to handle "Strong Hire"
  - [ ] Add logic to determine when to use "Strong Hire"

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-report.tsx`
  - [ ] Add "Strong Hire" badge/icon
  - [ ] Update color scheme (e.g., bright green for Strong Hire)
  - [ ] Update recommendation display

---

### 16. Evidence with Direct Quotes
**Status:** ❌ Evidence points are generic, no quotes

**Backend Changes:**
- [ ] Update `shared/schema.ts`
  - [ ] Enhance `EvidencePoint` interface:
```typescript
interface EvidencePoint {
  point: string; // Description
  quote: string; // NEW: Direct quote from transcript
  speaker: "interviewer" | "candidate"; // NEW
  timestamp?: number; // NEW
  competency: string;
  questionId: string | null;
  type: "positive" | "negative" | "neutral"; // NEW
  rubricSignal?: string; // NEW: Which rubric signal
}
```

- [ ] Update `server/services/gemini.ts` - `generateInterviewReport()`
  - [ ] Update prompt to require exact quotes
  - [ ] Extract quotes from transcript
  - [ ] Validate quotes exist in transcript
  - [ ] Include speaker attribution
  - [ ] Include timestamp

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-report.tsx`
  - [ ] Display quotes in evidence section
  - [ ] Show speaker attribution
  - [ ] Highlight quotes visually
  - [ ] Add "View in transcript" link (optional)

---

### 17. Rubric-Based Evaluation
**Status:** ❌ Not evaluating against question rubrics

**Backend Changes:**
- [ ] Add `QuestionEvaluation` interface to `shared/schema.ts`
```typescript
interface QuestionEvaluation {
  questionId: string;
  questionText: string;
  competencyId: string;
  competencyName: string;
  answer: string; // Full answer from transcript
  rubricScore: number; // 1-5
  strongSignalsFound: string[];
  weakSignalsFound: string[];
  evaluation: string; // Detailed explanation
  bestQuote: string; // Best supporting quote
  evidence: EvidencePoint[]; // Related evidence
}
```

- [ ] Update `InterviewReport` interface
  - [ ] Add `questionEvaluations: QuestionEvaluation[]` field
  - [ ] Add `overallScore: number` field
  - [ ] Add `strengths: string[]` field
  - [ ] Add `concerns: string[]` field

- [ ] Update `server/services/gemini.ts` - `generateInterviewReport()`
  - [ ] Rewrite prompt to emphasize rubric evaluation
  - [ ] For each question asked, evaluate answer against rubric
  - [ ] Check strong/weak signals
  - [ ] Generate question-by-question evaluation
  - [ ] Extract best quotes for each question
  - [ ] Calculate overall score (average of question scores)
  - [ ] Extract top strengths and concerns

**Frontend Changes:**
- [ ] Update `client/src/pages/interview-report.tsx`
  - [ ] Add question-by-question breakdown section
  - [ ] Show rubric scores per question
  - [ ] Display strong/weak signals found
  - [ ] Show overall score prominently
  - [ ] Display strengths and concerns lists

---

### 18. Scorecard UI Redesign
**Status:** ⚠️ Current UI is text-heavy, not scorecard format

**Frontend Changes:**
- [ ] Redesign `client/src/pages/interview-report.tsx`
  - [ ] Add scorecard header component
    - [ ] Overall recommendation badge (large, prominent)
    - [ ] Overall score display (1-5 with visual bar)
    - [ ] Key metrics summary
  - [ ] Add competency scorecard component
    - [ ] Visual bars/charts for each competency
    - [ ] Color coding (green/yellow/red)
    - [ ] Score with reasoning
  - [ ] Add question breakdown component
    - [ ] Accordion or table format
    - [ ] Show question, answer, evaluation, score
    - [ ] Link to evidence
  - [ ] Add evidence quotes component
    - [ ] Display quotes with attribution
    - [ ] Group by competency or question
    - [ ] Highlight positive/negative evidence
  - [ ] Add summary metrics
    - [ ] Strengths list
    - [ ] Concerns list
    - [ ] Overall statistics

**UI Components to Create:**
- [ ] `ScorecardHeader.tsx`
- [ ] `CompetencyScorecard.tsx`
- [ ] `QuestionBreakdown.tsx`
- [ ] `EvidenceQuotes.tsx`

---

## 📦 Dependencies to Install

```bash
# Phase 1
npm install pdf-parse @types/multer

# Already installed but not used:
# @google/genai (for Gemini 2.5 Pro)
# multer (in build.ts allowlist)
```

---

## 🔧 Environment Variables to Add

```env
# Required for Phase 1
GOOGLE_AI_API_KEY=your_google_ai_api_key

# Already required (but missing):
DATABASE_URL=postgresql://...
SESSION_SECRET=...
AI_INTEGRATIONS_OPENAI_API_KEY=...
AI_INTEGRATIONS_OPENAI_BASE_URL=...
```

---

## 📝 Summary by Priority

### 🔴 Critical (Must Fix First)
1. Create `.env` file with all required variables
2. Fix server startup (missing API keys)

### 🟠 High Priority (Phase 1 Core Features)
3. Switch to Gemini 2.5 Pro
4. PDF upload functionality
5. Update question generation (10-15 questions)
6. Re-prompt functionality

### 🟡 Medium Priority (Phase 2 Enhancements)
7. Speaker diarization
8. Answer quality evaluation
9. Context-aware suggestions
10. Question-answer tracking

### 🟢 Low Priority (Phase 3 & UI Polish)
11. "Strong Hire" option
12. Evidence with quotes
13. Rubric-based evaluation
14. Scorecard UI redesign
15. Manual question marking
16. Audio processing optimization

---

## 📊 Implementation Statistics

- **Total Features:** 18 major features
- **Backend Changes:** 14 features
- **Frontend Changes:** 10 features
- **New Files to Create:** 5 files
- **Files to Modify:** 8 files
- **New Dependencies:** 2 packages
- **New Environment Variables:** 1 variable

---

## ✅ Quick Start Checklist

Before starting implementation:

- [ ] Create `.env` file with all required variables
- [ ] Verify database connection works
- [ ] Test current server startup
- [ ] Review all three phase plans
- [ ] Set up Google AI API key for Gemini
- [ ] Install missing dependencies

---

**Last Updated:** 2025-01-27
**Status:** Planning Phase - Ready for Implementation
