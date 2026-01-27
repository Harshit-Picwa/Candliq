# Current API Endpoints Documentation

## Overview
This document lists all API endpoints currently implemented in the Candiq-AI backend.

---

## Authentication Endpoints
**File:** `server/auth/auth.ts` and `server/auth/routes.ts`

### GET `/api/login`
- **Description:** Creates a local development session
- **Authentication:** Not required
- **Response:** Redirects to app after creating session
- **Process:** Creates a mock user and session for local development

### GET `/api/callback`
- **Description:** Callback endpoint (redirects to app)
- **Authentication:** Not required
- **Response:** Redirects to app

### GET `/api/logout`
- **Description:** Logs out the current user
- **Authentication:** Not required (but session must exist)
- **Response:** Redirects to app after logout

### GET `/api/auth/user`
- **Description:** Get current authenticated user information
- **Authentication:** Required (`isAuthenticated`)
- **Response:** User object
- **Example Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://...",
  "createdAt": "2025-01-27T...",
  "updatedAt": "2025-01-27T..."
}
```

---

## Projects Endpoints
**File:** `server/routes.ts`

### GET `/api/projects`
- **Description:** Get all projects for the authenticated user
- **Authentication:** Required (`isAuthenticated`)
- **Response:** Array of Project objects
- **Example Response:**
```json
[
  {
    "id": 1,
    "userId": "user_123",
    "title": "Senior Software Engineer",
    "jdText": "...",
    "smeNotesText": "...",
    "competencyRubricJson": [...],
    "screeningQuestionsJson": [...],
    "createdAt": "2025-01-27T...",
    "updatedAt": "2025-01-27T..."
  }
]
```

### GET `/api/projects/:id`
- **Description:** Get a specific project by ID
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Response:** Project object or 404 if not found

### POST `/api/projects`
- **Description:** Create a new project
- **Authentication:** Required
- **Request Body:**
```json
{
  "title": "Project Title"
}
```
- **Response:** Created Project object (201 status)
- **Validation:** `title` is required

### PATCH `/api/projects/:id`
- **Description:** Update an existing project
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Request Body:** Partial Project object (any fields to update)
- **Response:** Updated Project object or 404 if not found
- **Example Body:**
```json
{
  "title": "Updated Title",
  "jdText": "Job description text...",
  "smeNotesText": "SME notes...",
  "competencyRubricJson": [...],
  "screeningQuestionsJson": [...]
}
```

### DELETE `/api/projects/:id`
- **Description:** Delete a project
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Response:** 204 No Content on success

### POST `/api/projects/:id/generate-questions`
- **Description:** Generate screening questions and competencies using AI
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Response:** Updated Project object with generated questions
- **Requirements:** Project must have `jdText` set
- **Process:**
  1. Reads JD and SME notes from project
  2. Calls `extractCompetenciesAndQuestions()` (currently uses OpenAI GPT-5.1)
  3. Updates project with generated competencies and questions
- **Error:** Returns 400 if JD is missing, 500 on AI generation failure

---

## Interviews Endpoints
**File:** `server/routes.ts`

### GET `/api/projects/:id/interviews`
- **Description:** Get all interviews for a specific project
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Response:** Array of Interview objects

### POST `/api/projects/:id/interviews`
- **Description:** Create a new interview for a project
- **Authentication:** Required
- **Parameters:** `id` (number) - Project ID
- **Request Body:**
```json
{
  "candidateName": "John Doe",
  "candidateEmail": "john@example.com" // optional
}
```
- **Response:** Created Interview object (201 status)
- **Validation:** `candidateName` is required
- **Default Status:** "draft"

### GET `/api/interviews/:id`
- **Description:** Get a specific interview by ID
- **Authentication:** Required
- **Parameters:** `id` (number) - Interview ID
- **Response:** Interview object or 404 if not found
- **Includes:** transcriptJson, notesJson, reportJson

### PATCH `/api/interviews/:id`
- **Description:** Update an existing interview
- **Authentication:** Required
- **Parameters:** `id` (number) - Interview ID
- **Request Body:** Partial Interview object
- **Response:** Updated Interview object or 404 if not found
- **Common Updates:**
  - `status`: "draft" | "in_progress" | "completed"
  - `transcriptJson`: Array of TranscriptEntry
  - `notesJson`: InterviewNotes object
  - `consentGiven`: boolean

### DELETE `/api/interviews/:id`
- **Description:** Delete an interview
- **Authentication:** Required
- **Parameters:** `id` (number) - Interview ID
- **Response:** 204 No Content on success

### POST `/api/interviews/:id/end`
- **Description:** End interview and generate evaluation report
- **Authentication:** Required
- **Parameters:** `id` (number) - Interview ID
- **Response:** Updated Interview object with generated report
- **Process:**
  1. Loads interview, project, and notes
  2. Calls `generateInterviewReport()` (currently uses OpenAI GPT-5.1)
  3. Updates interview status to "completed"
  4. Stores report in `reportJson` field
- **Error:** Returns 404 if interview/project not found, 500 on report generation failure

---

## WebSocket Endpoints
**File:** `server/routes.ts`

### WS `/api/interviews/:id/audio`
- **Description:** Real-time audio streaming for interview transcription
- **Authentication:** Not explicitly checked (should be added)
- **Parameters:** `id` (number) - Interview ID
- **Connection Flow:**
  1. Client connects via WebSocket
  2. Server validates interview and project exist
  3. Server loads existing transcript if any
- **Client → Server Messages:**
  - Binary audio chunks (WebM format, ~1 second intervals)
- **Server → Client Messages:**
  - `{ type: "transcript", speaker: "candidate", text: "...", isFinal: true }`
  - `{ type: "thinking" }` - AI is processing
  - `{ type: "suggestion", suggestions: [...] }` - Follow-up question suggestions
- **Processing:**
  - Audio buffered every 5 seconds
  - Transcribed via Whisper API (gpt-4o-mini-transcribe)
  - Follow-up suggestions generated every 30 seconds (if 3+ transcript entries)
  - Transcript auto-saved to database
- **Note:** Currently all transcript entries marked as "candidate" (no speaker diarization)

---

## Chat/Conversation Endpoints
**Note:** Chat endpoints are not currently registered in the main routes file.

### GET `/api/conversations`
- **Description:** Get all chat conversations
- **Authentication:** Not required (should be added)
- **Response:** Array of Conversation objects

### GET `/api/conversations/:id`
- **Description:** Get a specific conversation with all messages
- **Authentication:** Not required (should be added)
- **Parameters:** `id` (number) - Conversation ID
- **Response:** Conversation object with messages array
- **Example Response:**
```json
{
  "id": 1,
  "title": "New Chat",
  "createdAt": "2025-01-27T...",
  "messages": [
    {
      "id": 1,
      "conversationId": 1,
      "role": "user",
      "content": "Hello",
      "createdAt": "2025-01-27T..."
    }
  ]
}
```

### POST `/api/conversations`
- **Description:** Create a new chat conversation
- **Authentication:** Not required (should be added)
- **Request Body:**
```json
{
  "title": "New Chat" // optional, defaults to "New Chat"
}
```
- **Response:** Created Conversation object (201 status)

### DELETE `/api/conversations/:id`
- **Description:** Delete a conversation
- **Authentication:** Not required (should be added)
- **Parameters:** `id` (number) - Conversation ID
- **Response:** 204 No Content on success

### POST `/api/conversations/:id/messages`
- **Description:** Send a text message and get streaming AI response
- **Authentication:** Not required (should be added)
- **Parameters:** `id` (number) - Conversation ID
- **Request Body:**
```json
{
  "content": "User message text"
}
```
- **Response:** Server-Sent Events (SSE) stream
- **Stream Events:**
  - `{ content: "..." }` - Chunk of AI response
  - `{ done: true }` - Stream complete
  - `{ error: "..." }` - Error occurred
- **Process:**
  1. Saves user message to database
  2. Loads conversation history
  3. Streams response from OpenAI GPT-5.1
  4. Saves assistant message to database

---

## Audio/Voice Chat Endpoints
**Note:** Audio/Voice chat endpoints are not currently registered in the main routes file.

### POST `/api/conversations/:id/messages` (Voice)
- **Description:** Send voice message and get streaming audio response
- **Authentication:** Not required (should be added)
- **Parameters:** `id` (number) - Conversation ID
- **Request Body:**
```json
{
  "audio": "base64_encoded_audio_data",
  "voice": "alloy", // optional, default: "alloy"
  "inputFormat": "wav" // optional, default: "wav"
}
```
- **Response:** Server-Sent Events (SSE) stream
- **Stream Events:**
  - `{ type: "user_transcript", data: "..." }` - Transcribed user speech
  - `{ type: "transcript", data: "..." }` - AI response transcript
  - `{ type: "audio", data: "..." }` - Audio data chunks
  - `{ type: "done", transcript: "..." }` - Stream complete
  - `{ type: "error", error: "..." }` - Error occurred
- **Process:**
  1. Transcribes user audio via Whisper (gpt-4o-mini-transcribe)
  2. Saves user message
  3. Streams audio response from gpt-audio-mini
  4. Saves assistant message

### POST `/api/conversations/:id/voice-stream`
- **Description:** Voice chat with separate text model + TTS pipeline
- **Authentication:** Not required (should be added)
- **Parameters:** `id` (number) - Conversation ID
- **Request Body:**
```json
{
  "audio": "base64_encoded_audio_data",
  "voice": "alloy", // optional
  "inputFormat": "wav", // optional
  "locale": "en" // optional, for sentence segmentation
}
```
- **Response:** Server-Sent Events (SSE) stream
- **Stream Events:**
  - `{ type: "user_transcript", data: "..." }`
  - `{ type: "transcript", data: "..." }`
  - `{ type: "sentence", data: "...", seq: 0 }`
  - `{ type: "audio", data: "...", seq: 0 }`
  - `{ type: "done" }`
  - `{ type: "error", error: "..." }`
- **Features:**
  - Uses GPT-5 for text generation
  - Streams sentences to TTS as they're generated
  - Supports multilingual sentence detection
  - Lower latency than full audio model

---

## API Summary

### Total Endpoints: 20+

#### REST Endpoints: 18
- **Projects:** 6 endpoints (GET list, GET one, POST, PATCH, DELETE, POST generate-questions)
- **Interviews:** 6 endpoints (GET list, GET one, POST, PATCH, DELETE, POST end)
- **Chat/Conversations:** 5 endpoints (GET list, GET one, POST, DELETE, POST messages)
- **Audio/Voice:** 2 endpoints (POST messages voice, POST voice-stream)
- **Auth:** 3 endpoints (GET login, GET callback, GET logout)

#### WebSocket Endpoints: 1
- **Audio Streaming:** WS `/api/interviews/:id/audio`

---

## Authentication Status

### Protected Endpoints (require `isAuthenticated`):
- ✅ All `/api/projects/*` endpoints
- ✅ All `/api/interviews/*` endpoints
- ❌ Chat/Conversation endpoints (NOT protected - should be added)
- ❌ Audio/Voice endpoints (NOT protected - should be added)
- ❌ WebSocket audio endpoint (NOT explicitly protected)

---

## Current AI Models Used

1. **OpenAI GPT-5.1** (via `server/services/gemini.ts`)
   - Question generation (`extractCompetenciesAndQuestions`)
   - Follow-up suggestions (`generateFollowUpSuggestions`)
   - Report generation (`generateInterviewReport`)

2. **OpenAI Whisper** (via `server/services/whisper.ts`)
   - Audio transcription (`transcribeAudio`)
   - Model: `gpt-4o-mini-transcribe`

3. **OpenAI GPT-5** (via `server/services/gemini.ts`)
   - Text generation for interview reports and questions

---

## Missing Endpoints (From Implementation Plans)

### Phase 1:
- ❌ POST `/api/projects/:id/upload-jd` - PDF upload endpoint
- ❌ POST `/api/projects/:id/regenerate-questions` - Re-prompt with custom instructions

### Phase 2:
- ❌ POST `/api/interviews/:id/mark-question` - Manual question marking
- ❌ WebSocket message type: `answer_evaluation` - Real-time answer quality

### Phase 3:
- ✅ POST `/api/interviews/:id/end` - Already exists, but needs enhancement

---

## Response Formats

### Success Responses:
- **200 OK:** Standard success response with data
- **201 Created:** Resource created successfully
- **204 No Content:** Successful deletion

### Error Responses:
- **400 Bad Request:** Validation error or missing required fields
- **401 Unauthorized:** Authentication required or failed
- **404 Not Found:** Resource not found
- **500 Internal Server Error:** Server error with error message

### Error Response Format:
```json
{
  "error": "Error message",
  "details": "Additional details" // optional
}
```

---

## Notes

1. **Authentication:** Chat and audio endpoints are not protected - should add `isAuthenticated` middleware
2. **WebSocket:** Audio WebSocket doesn't explicitly check authentication
3. **AI Models:** Currently using OpenAI, needs to switch to Gemini 2.5 Pro for Phase 1
4. **Speaker Detection:** All transcript entries currently marked as "candidate" - needs diarization
5. **File Upload:** No file upload endpoints exist yet (needed for PDF upload)
