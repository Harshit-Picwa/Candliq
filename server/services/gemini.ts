import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Competency, ScreeningQuestion, InterviewReport, TranscriptEntry, AISuggestion, InterviewNotes, AnswerEvaluation, AIChatMessage } from "@shared/schema";

const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
if (!apiKey) {
  console.warn("[gemini] WARNING: No API key found. Set GOOGLE_AI_API_KEY environment variable.");
}
const genAI = new GoogleGenerativeAI(apiKey);

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function repairJsonText(input: string) {
  let text = String(input || "").trim();
  if (!text) return text;

  // Strip markdown code fences if present.
  text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");

  // Quote unquoted object keys: { key: ... } or , key:
  text = text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  // Convert single-quoted keys to double-quoted keys.
  text = text.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
  // Convert simple single-quoted string values to double-quoted values.
  text = text.replace(/:\s*'([^']*)'/g, (_match, value) => `: "${String(value).replace(/"/g, '\\"')}"`);

  // Remove trailing commas.
  text = text.replace(/,\s*([}\]])/g, "$1");

  // Normalize common non-JSON literals.
  text = text.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");

  return text;
}

function safeJsonParse<T>(jsonText: string, context: string) {
  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    const repaired = repairJsonText(jsonText);
    try {
      const parsed = JSON.parse(repaired) as T;
      console.warn(`[gemini] JSON parse failed for ${context}. Repaired and parsed successfully.`);
      return parsed;
    } catch (_repairError) {
      console.error(`[gemini] JSON parse failed for ${context} after repair.`);
      throw error;
    }
  }
}

function normalizeQuestionKey(question: string) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dedupeByQuestionText(questions: ScreeningQuestion[]) {
  const seen = new Set<string>();
  const out: ScreeningQuestion[] = [];
  for (const q of questions) {
    const key = normalizeQuestionKey(q.question);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(q);
  }
  return out;
}

function rubricMeetsMinSignals(q: ScreeningQuestion, minPerBucket: number) {
  const good = q.rubric?.goodSignals?.length ?? 0;
  const moderate = q.rubric?.moderateSignals?.length ?? 0;
  const poor = q.rubric?.poorSignals?.length ?? 0;
  return good >= minPerBucket && moderate >= minPerBucket && poor >= minPerBucket;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error: any) {
  const message = String(error?.message || "");
  // Typical transient/network failures coming from fetch / undici
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("EAI_AGAIN") ||
    message.includes("ENOTFOUND") ||
    message.includes("socket") ||
    message.includes("network")
  );
}

function getGeminiModelCandidates() {
  const preferred = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  // Updated for Feb 2026: Using Gemini 2.0 and 2.5 series as primary models.
  const fallbacks = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-pro", "gemini-flash-latest"];
  return [preferred, ...fallbacks].filter((v, i, a) => a.indexOf(v) === i);
}

async function generateTextWithRetries(prompt: string) {
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
  }

  const models = getGeminiModelCandidates();
  let lastError: any = null;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({ model: modelName });
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return { text: response.text(), modelName };
      } catch (error: any) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        const msg = String(error?.message || error);
        console.error(`[gemini] generateContent failed (model=${modelName}, attempt=${attempt}/${maxAttempts}):`, msg);

        if (!retryable) break; // try next model

        // Exponential-ish backoff
        await sleep(350 * attempt * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Unknown Gemini error"));
}

async function sendMessageWithRetries(prompt: string, history: AIChatMessage[] = []) {
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
  }

  const models = getGeminiModelCandidates();
  let lastError: any = null;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({ model: modelName });
    const chat = model.startChat({
      history: (history as any[]),
    });
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const newHistory = await chat.getHistory();
        return {
          text: response.text(),
          modelName,
          history: (newHistory as unknown as AIChatMessage[])
        };
      } catch (error: any) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        const msg = String(error?.message || error);
        console.error(`[gemini] sendMessage failed (model=${modelName}, attempt=${attempt}/${maxAttempts}):`, msg);

        if (!retryable) break; // try next model

        // Exponential-ish backoff
        await sleep(350 * attempt * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Unknown Gemini error"));
}

function normalizeQuestions(
  competencies: Competency[],
  questions: ScreeningQuestion[],
  targetCount: number
) {
  const validCompetencyIds = new Set(competencies.map((c) => c.id));

  // Fix missing/invalid competencyId by round-robin assignment.
  const safeCompetencyIds = competencies.length ? competencies.map((c) => c.id) : ["comp_fallback"];
  let rr = 0;
  const normalized = questions.map((q, idx) => {
    const competencyId =
      q.competencyId && validCompetencyIds.has(q.competencyId)
        ? q.competencyId
        : safeCompetencyIds[rr++ % safeCompetencyIds.length];

    return {
      ...q,
      id: q.id || `q_${generateId()}`,
      competencyId,
      isMandatory: q.isMandatory ?? true,
      order: idx + 1,
      rubric: {
        typicalReasoning: q.rubric?.typicalReasoning || "",
        goodSignals: q.rubric?.goodSignals || [],
        moderateSignals: q.rubric?.moderateSignals || [],
        poorSignals: q.rubric?.poorSignals || [],
        notes: q.rubric?.notes || "",
      },
    };
  });

  if (normalized.length > targetCount) {
    return normalized.slice(0, targetCount).map((q, idx) => ({ ...q, order: idx + 1 }));
  }

  return normalized;
}

export async function extractCompetenciesAndQuestions(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  interviewDuration?: number,
  existingQuestions?: ScreeningQuestion[],
  chatHistory: AIChatMessage[] = []
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  // Target question count rules:
  // - < 20 mins: 8 questions (range 6-8)
  // - 20-25 mins: 10 questions (range 8-10)
  // - > 25 mins: 12 questions (range 10-12)
  console.log(`[gemini] extractCompetenciesAndQuestions called with duration: ${interviewDuration}`);

  let targetQuestionCount = 8;
  if (typeof interviewDuration === "number" && !Number.isNaN(interviewDuration) && interviewDuration > 0) {
    if (interviewDuration < 20) {
      targetQuestionCount = 8;
    } else if (interviewDuration <= 25) {
      targetQuestionCount = 10;
    } else {
      targetQuestionCount = 12;
    }
  }
  console.log(`[gemini] Calculated targetQuestionCount: ${targetQuestionCount}`);

  const existingQuestionTexts = (existingQuestions || [])
    .map((q) => q?.question)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  const existingQuestionKeys = new Set(existingQuestionTexts.map(normalizeQuestionKey).filter(Boolean));

  const prompt = `You are a subject matter expert in the role that is being hired. 

See the JD ${companyWebsite ? `from ${companyWebsite} ` : ""}attached for context.

In addition to this, the role is being hired in Melbourne, Victoria. 

JOB DESCRIPTION:
${jdText}

Here are also some notes from the Subject Matter Expert for more context: 
"${smeNotes || "Focus on key technical skills needed for the role."}"

You are wanting your hiring manager to ask some technical/skills questions that are easy for them to ask without subject matter expertise. The questions and answer must take no longer than ${interviewDuration || 15} minutes. 

Create those questions, expected answers with a screening criteria (Good-fit answer, moderate-fit answer, bad-fit answer) that will be easy for the hiring manager to ask and also conclude if the candidate is a good-fit (Questions can be scenario based or actually asking about a skill directly). 

The objective of this round from the hiring manager is to save time of the subject matter expert by reducing candidates that are clearly not a good-fit and ones that just answer buzzwords and lack needed experience/knowledge.

${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n` : ""}

${existingQuestionTexts.length ? `EXISTING QUESTIONS (DO NOT REPEAT OR PARAPHRASE THESE):\n${existingQuestionTexts.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nWhen regenerating, you MUST produce an entirely new set of questions that do not overlap in meaning with the above list. Avoid trivial rewording.\n` : ""}

Instructions for Output:
1. Extract 3-5 key competencies from the job description. Focus strictly on technical and role-specific skills.
2. Generate exactly ${targetQuestionCount} screening questions total, distributed across these competencies.
3. Ensure questions are well-distributed and deeply technical/role-oriented. A significant portion (at least 50%) must be **Scenario-Based** (e.g., "Given situation X, how would you handle it using tool Y?").
4. ABSOLUTELY NO CULTURE-FIT OR SOFT-SKILLS QUESTIONS. Do not ask about personality, teamwork (unless technical collaboration like Git workflow), or "where they see themselves." Focus exclusively on the hard skills, domain knowledge, and operational proficiency required by the JD and SME notes.
5. NO REVERSE QUESTIONS: Do not generate questions that ask the candidate if they have questions for the interviewer (e.g., "What questions do you have for me?"). Every question must be a technical or scenario-based evaluation of the candidate.
6. UNIQUE AND NON-REPETITIVE: Every question in this set MUST be completely unique from the others. Do not repeat the same concept across different questions. If you are provided with "EXISTING QUESTIONS" above, do not repeat or paraphrase them in any way.
7. For each question, provide a rubric EXPLICITLY DESIGNED for a non-technical HR interviewer to use for grading as a **'Strength-Assessment' tool**:
   - typicalReasoning: Detailed explanation of the technical 'why' behind the question and what a successful candidate's thought process should look like.
   - goodSignals: (Best Answer Indicators) - exactly 5 highly specific, explanatory points that describe the 'Best' technical answer. Each signal must be a clear "Listen-for" statement that includes the actual domain terms, tools, or logic the candidate should use (e.g., "Explains how 'Redux' state is handled via 'Actions' and 'Reducers' to ensure predictable state transitions").
   - moderateSignals: (Moderate Answer Indicators) - exactly 5 explanatory points describing an 'Average' answer. These are answers that are technically correct but broad, lacking the depth or naming conventions of the best answers (e.g., "Describes state management generally but misses the specific flow of data through Reducers").
   - poorSignals: (Red Flags / Poor Indicators) - exactly 5 clear, explanatory red flags or weak indicators. These describe 'Bad' or incorrect logic that a non-technical interviewer can spot (e.g., "Suggests handling state by directly mutating the DOM or using global variables, which leads to bugs").
   - notes: Specific domain-specific probing questions for the HR person to use if the initial answer is vague.

CRITICAL: You are acting as a world-class Subject Matter Expert. The rubrics must be so precise and explanatory that an interviewer with NO domain knowledge can accurately distinguish between a junior, mid, and expert candidate just by comparing their verbal answer to these signals. Avoid generic filler. Direct matches to technical concepts from the JD are mandatory.

IMPORTANT: You must generate exactly ${targetQuestionCount} questions total. Count them carefully.

Respond with a JSON object in this exact format:
{
  "competencies": [
    {
      "id": "comp_1",
      "name": "Backend Development",
      "description": "Proficiency in API design and server-side logic"
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "competencyId": "comp_1",
      "question": "How would you handle unexpected errors in a FastAPI end-point to ensure the client receives a clear message?",
      "rubric": {
        "typicalReasoning": "The candidate should describe a strategy that uses structured exception handling to avoid server crashes and provide friendly API responses.",
        "goodSignals": [
          "BEST: Explicitly mentions using 'HTTPException' from the fastapi library with proper status codes (e.g., 400 or 404).",
          "BEST: Describes creating a 'Global Exception Handler' to catch and log errors in a centralized way.",
          "BEST: Mentions using Pydantic for request validation to automatically catch schema errors before they reach logic.",
          "BEST: Explains returning a structured JSON error body (e.g., { 'detail': 'error msg' }) for frontend consumption.",
          "BEST: Mentions logging the full stack trace in internal logs (e.g., using 'logger.error') while hiding sensitive info from the user."
        ],
        "moderateSignals": [
          "MODERATE: Suggests using basic 'try...except' blocks in every route but lacks a centralized strategy.",
          "MODERATE: Mentions returning generic codes like 500 without specifying the exact error cause.",
          "MODERATE: Suggests using 'print' statements for debugging instead of professional logging libraries.",
          "MODERATE: Can explain what an error is but doesn't mention specific FastAPI or Pydantic features.",
          "MODERATE: Mentions checking logs only as a reactive step after a crash occurs."
        ],
        "poorSignals": [
          "RED FLAG: Suggests ignoring errors or letting the app crash and restart automatically.",
          "RED FLAG: Unable to explain what an HTTP status code is or why it's used.",
          "RED FLAG: Suggests catching all exceptions ('except Exception:') and doing nothing, which masks bugs.",
          "RED FLAG: Confuses FastAPI's error handling with a frontend framework like React (e.g., 'I would use an ErrorBoundary').",
          "RED FLAG: Cannot name a single library or tool for logging or structured error reporting."
        ],
        "notes": "Ask: 'How do you distinguish between an error caused by invalid input versus a database failure?'"
      },
      "isMandatory": true,
      "order": 1
    }
  ]
}

Only output valid JSON. No markdown code blocks.`;

  try {
    const { text, modelName, history: updatedHistory } = await sendMessageWithRetries(prompt, chatHistory);

    console.log("[gemini] Raw AI response length:", text.length);
    console.log("[gemini] Raw AI response preview:", text.substring(0, 200));
    console.log("[gemini] Model used:", modelName);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[gemini] Failed to find JSON in response. Full response:", text);
      throw new Error("Failed to parse AI response as JSON");
    }

    const parseResponse = (jsonText: string) => {
      const parsed = safeJsonParse<any>(jsonText, "competencies/questions");
      const competencies: Competency[] = (parsed.competencies || []).map((c: any) => ({
        id: c.id || `comp_${generateId()}`,
        name: c.name,
        description: c.description,
      }));
      const questions: ScreeningQuestion[] = (parsed.questions || []).map((q: any, idx: number) => ({
        id: q.id || `q_${generateId()}`,
        competencyId: q.competencyId,
        question: q.question,
        rubric: q.rubric,
        isMandatory: q.isMandatory ?? true,
        order: q.order || idx + 1,
      }));
      return { competencies, questions };
    };

    let { competencies, questions } = parseResponse(jsonMatch[0]);
    questions = normalizeQuestions(competencies, questions, targetQuestionCount);
    questions = dedupeByQuestionText(questions);
    if (existingQuestionKeys.size) {
      questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
    }

    // If the model didn't respect the requested count, repair once, then fill any remaining gap.
    if (questions.length !== targetQuestionCount) {
      console.warn(
        `[gemini] Question count mismatch. Wanted ${targetQuestionCount}, got ${questions.length}. Attempting repair.`
      );

      const repairPrompt = `You previously generated screening questions, but the question count was wrong.

JOB DESCRIPTION:
${jdText}

${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}\n` : ""}
${smeNotes ? `SME NOTES:\n${smeNotes}\n` : ""}
${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n` : ""}
${existingQuestionTexts.length ? `EXISTING QUESTIONS (MUST NOT REPEAT OR PARAPHRASE):\n${existingQuestionTexts.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : ""}

PREVIOUS (INCORRECT) OUTPUT JSON:
${jsonMatch[0]}

Task:
- Regenerate the FULL JSON response in the same format as before.
- Produce exactly ${targetQuestionCount} questions total (no more, no less).
- Keep 3-5 competencies, distribute questions across them, and ensure each question has a full rubric.
- Make rubrics precise and role-specific (tools, domain, responsibilities) using the job description.
${existingQuestionTexts.length ? `- Every generated question must be NEW and must not overlap in meaning with the existing questions listed above.\n` : ""}

Only output valid JSON. No markdown.`;

      const repaired = await generateTextWithRetries(repairPrompt);
      const repairedMatch = repaired.text.match(/\{[\s\S]*\}/);
      if (repairedMatch) {
        ({ competencies, questions } = parseResponse(repairedMatch[0]));
        questions = normalizeQuestions(competencies, questions, targetQuestionCount);
        questions = dedupeByQuestionText(questions);
        if (existingQuestionKeys.size) {
          questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
        }
      }
    }

    if (questions.length < targetQuestionCount) {
      const missing = targetQuestionCount - questions.length;
      console.warn(`[gemini] Still missing ${missing} questions. Requesting additional questions.`);

      const avoidQuestions = Array.from(
        new Set([...existingQuestionTexts, ...questions.map((q) => q.question)].filter(Boolean))
      );

      const addPrompt = `You are an expert HR consultant.

JOB DESCRIPTION:
${jdText}

${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}\n` : ""}
${smeNotes ? `SME NOTES:\n${smeNotes}\n` : ""}

COMPETENCIES (use these ids):
${JSON.stringify(competencies, null, 2)}

EXISTING QUESTIONS (do not duplicate these):
${JSON.stringify(avoidQuestions, null, 2)}

Generate exactly ${missing} ADDITIONAL screening questions (JSON array only). Requirements:
- Each item must include: id, competencyId, question, rubric{typicalReasoning, goodSignals, moderateSignals, poorSignals, notes}, isMandatory, order
- Rubrics must be precise and role-specific using the job description context
- Use competencyId from the provided competencies
- Questions must be substantively new (no trivial rewording of existing questions)
- goodSignals/moderateSignals/poorSignals must each contain exactly 5 items

Only output a JSON array. No markdown.`;

      const added = await generateTextWithRetries(addPrompt);
      const addedMatch = added.text.match(/\[[\s\S]*\]/);
      if (addedMatch) {
        const addedQuestionsRaw = safeJsonParse<any>(addedMatch[0], "additional questions array");
        if (!Array.isArray(addedQuestionsRaw)) {
          console.warn("[gemini] Additional questions response was not an array. Skipping.");
        } else {
          const addedQuestions = addedQuestionsRaw.map((q: any, idx: number) => ({
            id: q.id || `q_${generateId()}`,
            competencyId: q.competencyId,
            question: q.question,
            rubric: q.rubric,
            isMandatory: q.isMandatory ?? true,
            order: questions.length + idx + 1,
          })) as ScreeningQuestion[];

          const merged = normalizeQuestions(competencies, [...questions, ...addedQuestions], targetQuestionCount);
          questions = dedupeByQuestionText(merged);
          if (existingQuestionKeys.size) {
            questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
          }
        }
      }
    }

    // Ensure rubric signal arrays have enough points (exactly or at least 5 each -- target 5).
    const minSignals = 5;
    if (questions.some((q) => !rubricMeetsMinSignals(q, minSignals))) {
      console.warn(`[gemini] Rubric signals below minimum (${minSignals}). Attempting rubric expansion/fix.`);

      const expandRubricsPrompt = `You are an expert HR consultant.

JOB DESCRIPTION:
${jdText}

${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}\n` : ""}
${smeNotes ? `SME NOTES:\n${smeNotes}\n` : ""}
${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n` : ""}

CURRENT OUTPUT JSON (keep the same competencies and the same questions; do not change question text or count):
${JSON.stringify({ competencies, questions }, null, 2)}

Task:
- Update ONLY the rubrics so they are more precise and role-specific using the job description.
- For EVERY question:
  - goodSignals must have exactly ${minSignals} items
  - moderateSignals must have exactly ${minSignals} items
  - poorSignals must have exactly ${minSignals} items
- Keep each signal specific (tools/stack/domain/responsibilities), avoid generic filler.
- Keep id, competencyId, question, isMandatory, and order unchanged.

Respond with ONLY the full JSON object in the same format. No markdown.`;

      const expanded = await generateTextWithRetries(expandRubricsPrompt);
      const expandedMatch = expanded.text.match(/\{[\s\S]*\}/);
      if (expandedMatch) {
        const expandedParsed = parseResponse(expandedMatch[0]);
        competencies = expandedParsed.competencies;
        questions = normalizeQuestions(expandedParsed.competencies, expandedParsed.questions, targetQuestionCount);
        questions = dedupeByQuestionText(questions);
        if (existingQuestionKeys.size) {
          questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
        }
        // Re-apply final ordering and hard count guarantee after expansion.
        if (questions.length > targetQuestionCount) questions = questions.slice(0, targetQuestionCount);
        questions = questions.map((q, idx) => ({ ...q, order: idx + 1 }));
      }
    }

    // Final hard guarantee: truncate if still too long; re-order consistently.
    if (questions.length > targetQuestionCount) {
      questions = questions.slice(0, targetQuestionCount);
    }
    questions = questions.map((q, idx) => ({ ...q, order: idx + 1 }));

    // For >20 mins, treat questions beyond the first 10 as optional by default.
    if (typeof interviewDuration === "number" && interviewDuration > 20 && questions.length > 10) {
      questions = questions.map((q, idx) => ({
        ...q,
        isMandatory: idx < 10,
      }));
    }

    console.log("[gemini] Final question count:", questions.length, "target:", targetQuestionCount);
    return { competencies, questions, history: updatedHistory };
  } catch (error: any) {
    console.error("[gemini] AI API error:", error);
    console.error("[gemini] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    if (error.message?.includes("API key")) {
      throw new Error("Invalid or missing Google AI API key. Please check your GOOGLE_AI_API_KEY environment variable.");
    }

    throw new Error(`AI generation failed: ${error.message || "Unknown error"}`);
  }
}

export async function regenerateQuestionsWithInstructions(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  interviewDuration?: number,
  existingQuestions?: ScreeningQuestion[],
  chatHistory: AIChatMessage[] = []
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  return extractCompetenciesAndQuestions(
    jdText,
    smeNotes,
    customInstructions,
    companyWebsite,
    interviewDuration,
    existingQuestions,
    chatHistory
  );
}

export async function refineIndividualQuestion(
  jdText: string,
  question: ScreeningQuestion,
  instructions: string,
  chatHistory: AIChatMessage[] = []
): Promise<{ question: ScreeningQuestion; history: AIChatMessage[] }> {
  const prompt = `As a subject matter expert, refine the following screening interview question based on the custom instructions and the Job Description.

CURRENT QUESTION:
${JSON.stringify(question, null, 2)}

CUSTOM INSTRUCTIONS:
${instructions}

Instructions:
1. Refine the question text to be more effective, technical, and role-specific. Avoid generic or "fluff" phrasing. Use "technical skills" where appropriate. ABSOLUTELY NO CULTURE-FIT, BEHAVIORAL SOFT-SKILLS, OR REVERSE QUESTIONS (e.g. "Do you have any questions for us?").
2. Update the rubric (typicalReasoning, goodSignals, moderateSignals, poorSignals, notes) to match the new question.
   - typicalReasoning: Detailed explanation of the technical 'why' behind the question and what a successful candidate's thought process should look like.
   - goodSignals: (Best Answer Indicators) - exactly 5 highly specific, explanatory points that describe the 'Best' technical answer. Each signal must be a clear "Listen-for" statement (e.g., "BEST: Explains X using Y terminology").
   - moderateSignals: (Moderate Answer Indicators) - exactly 5 explanatory points describing an 'Average' answer. Technically correct but lacking depth (e.g., "MODERATE: Mentions X generally").
   - poorSignals: (Red Flags / Poor Indicators) - exactly 5 clear, explanatory red flags or weak indicators (e.g., "RED FLAG: Suggests X or cannot explain Y").
   - notes: Specific domain-specific probing questions for the HR person to use if the initial answer is vague.

CRITICAL: The rubrics must be so precise and descriptive that a recruiter with NO technical knowledge can confidently grade the candidate's answer by mapping their words to these signals. Avoid generic signals like "Good communication" or "Seems knowledgeable". Use specific technical terminology.
4. Continue to ensure the refined question stays within the scope of a standard screening question (approx 2-3 minutes to answer) so it does not disrupt the overall interview timeline.
5. Keep the same competencyId and id.
6. Respond with ONLY the refined question object in JSON format.

Only output valid JSON object. No markdown code blocks.`;

  try {
    const { text, history: updatedHistory } = await sendMessageWithRetries(prompt, chatHistory);
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to parse refined question response");
    }

    const q = safeJsonParse<any>(jsonMatch[0], "refined question");
    const refined = {
      ...q,
      id: question.id,
      competencyId: question.competencyId,
      order: question.order,
      isMandatory: question.isMandatory,
    };
    return { question: refined, history: updatedHistory };
  } catch (error: any) {
    console.error("[gemini] Refine question error:", error);
    throw error;
  }
}

export async function refineMultipleQuestions(
  jdText: string,
  questions: ScreeningQuestion[],
  instructions: string,
  chatHistory: AIChatMessage[] = []
): Promise<{ questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  const prompt = `As a subject matter expert, refine the following ${questions.length} screening interview questions based on the custom instructions and the Job Description.

CURRENT QUESTIONS:
${JSON.stringify(questions, null, 2)}

CUSTOM INSTRUCTIONS:
${instructions}

Instructions:
1. Refine each question text to be more effective, technical, and role-specific. Avoid generic phrasing. Use "technical skills" where appropriate. ABSOLUTELY NO CULTURE-FIT, BEHAVIORAL SOFT-SKILLS, OR REVERSE QUESTIONS (e.g. "Do you have any questions for us?").
2. Update the rubrics (typicalReasoning, goodSignals, moderateSignals, poorSignals, notes) for each refined question.
   - typicalReasoning: Detailed explanation of the technical 'why' behind the question and what a successful candidate's thought process should look like.
   - goodSignals: (Best Answer Indicators) - exactly 5 highly specific, explanatory points that describe the 'Best' technical answer. Each signal must be a clear "Listen-for" statement (e.g., "BEST: Explains X using Y terminology").
   - moderateSignals: (Moderate Answer Indicators) - exactly 5 explanatory points describing an 'Average' answer. Technically correct but lacking depth (e.g., "MODERATE: Mentions X generally").
   - poorSignals: (Red Flags / Poor Indicators) - exactly 5 clear, explanatory red flags or weak indicators (e.g., "RED FLAG: Suggests X or cannot explain Y").
   - notes: Specific domain-specific probing questions for the HR person to use if the initial answer is vague.

CRITICAL: The rubrics must be so precise and descriptive that a recruiter with NO technical knowledge can confidently grade the candidate's answer by mapping their words to these signals. Avoid generic signals like "Good communication" or "Seems knowledgeable". Use specific technical terminology.
3. Keep the same competencyId and id for each question.
4. Continue to ensure the refined questions stay within the scope of a standard screening question (approx 2-3 minutes to answer) so they do not disrupt the overall interview timeline.
5. Respond with a JSON object containing a "questions" array of refined question objects.

Respond with ONLY the JSON object. No markdown code blocks.`;

  try {
    const { text, history: updatedHistory } = await sendMessageWithRetries(prompt, chatHistory);
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to parse refined questions response");
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "refined questions");
    const refinedBatch = parsed.questions || [];

    const refinedQuestions = refinedBatch.map((refined: any) => {
      const original = questions.find(q => q.id === refined.id);
      return {
        ...refined,
        id: refined.id,
        competencyId: refined.competencyId || original?.competencyId,
        order: refined.order || original?.order,
        isMandatory: refined.isMandatory ?? original?.isMandatory ?? true,
      };
    });

    return { questions: refinedQuestions, history: updatedHistory };
  } catch (error: any) {
    console.error("[gemini] Refine multiple questions error:", error);
    throw error;
  }
}

export async function generateFollowUpSuggestions(
  transcript: TranscriptEntry[],
  competencies: Competency[],
  questions: ScreeningQuestion[],
  questionsAsked: string[]
): Promise<AISuggestion[]> {
  if (transcript.length < 3) return [];

  const recentTranscript = transcript.slice(-10).map(t =>
    `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`
  ).join("\n");

  const competencyList = competencies.map(c => `- ${c.name}: ${c.description}`).join("\n");
  const askedQuestions = questionsAsked.length > 0
    ? questions.filter(q => questionsAsked.includes(q.id)).map(q => `- ${q.question}`).join("\n")
    : "None yet";

  const prompt = `You are an expert interview coach providing real-time suggestions to an interviewer.

COMPETENCIES BEING ASSESSED:
${competencyList}

QUESTIONS ALREADY ASKED:
${askedQuestions}

RECENT CONVERSATION:
${recentTranscript}

Based on what the candidate just said, suggest 1-2 follow-up questions that would:
1. Dig deeper into their answer
2. Probe for specific examples or evidence
3. Clarify any ambiguous statements
4. Explore areas related to the competencies being assessed

Respond with a JSON array:
[
  {
    "id": "sug_1",
    "type": "followup",
    "question": "You mentioned leading the project - can you walk me through a specific decision you made?",
    "competencyId": "comp_1",
    "reason": "The candidate was vague about their leadership role"
  }
]

Only output valid JSON array. No markdown code blocks.`;

  try {
    if (!apiKey) {
      console.warn("[gemini] Cannot generate suggestions: API key not set");
      return [];
    }

    const { text } = await generateTextWithRetries(prompt);
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) return [];

    const suggestions = safeJsonParse<any>(jsonMatch[0], "follow-up suggestions");
    return suggestions.map((s: any) => ({
      id: s.id || `sug_${generateId()}`,
      type: s.type || "followup",
      question: s.question,
      competencyId: s.competencyId,
      reason: s.reason,
    }));
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return [];
  }
}

export async function evaluateAnswerQuality(
  question: ScreeningQuestion,
  candidateAnswer: string,
  fullTranscript: TranscriptEntry[]
): Promise<AnswerEvaluation> {
  const prompt = `You are an expert interviewer evaluating a candidate's answer against a structured rubric.

QUESTION:
${question.question}

RUBRIC:
- Typical Reasoning: ${question.rubric.typicalReasoning}
- Good Signals: ${question.rubric.goodSignals?.join(", ")}
- Moderate Signals: ${question.rubric.moderateSignals?.join(", ")}
- Poor Signals: ${question.rubric.poorSignals?.join(", ")}

${question.rubric.notes ? `- Notes: ${question.rubric.notes}` : ""}

CANDIDATE'S ANSWER:
${candidateAnswer}

CONTEXT (recent conversation):
${fullTranscript.slice(-5).map(t => `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`).join("\n")}

Evaluate the candidate's answer and respond with a JSON object:
{
  "quality": "good" | "moderate" | "poor",
  "score": 1-5,
  "goodSignalsFound": ["signal1", "signal2"],
  "moderateSignalsFound": ["signal1", "signal2"],
  "poorSignalsFound": ["signal1", "signal2"],
  "reasoning": "Brief explanation of why this quality/score was assigned"
}

Guidelines:
- "good": Answer demonstrates multiple specific "Good Signals" (e.g. named specific tools, algorithms, or patterns).
- "moderate": Answer is correct but lacks technical specificity or depth of signals.
- "poor": Answer hits "Poor Signals" or red flags (e.g. vague, confused, or generic).
- Score: 1-5 (1=very weak, 3=moderate, 5=excellent).
- Identify and list the PRECISE signals from the rubric that were found in the candidate's answer.
- Be objective and lean toward evidence-based technical indicators.

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      console.warn("[gemini] Cannot evaluate answer: API key not set");
      return {
        quality: "moderate",
        score: 3,
        signals: { good: [], moderate: [], poor: [] },
        reasoning: "Evaluation unavailable - API key not configured",
        questionId: question.id,
      };
    }

    const { text } = await generateTextWithRetries(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("[gemini] Failed to parse answer evaluation response");
      return {
        quality: "moderate",
        score: 3,
        signals: { good: [], moderate: [], poor: [] },
        reasoning: "Failed to parse evaluation",
        questionId: question.id,
      };
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "answer evaluation");

    return {
      quality: parsed.quality === "good" || parsed.quality === "poor" ? parsed.quality : "moderate",
      score: Math.min(5, Math.max(1, parsed.score || 3)),
      signals: {
        good: parsed.goodSignalsFound || [],
        moderate: parsed.moderateSignalsFound || [],
        poor: parsed.poorSignalsFound || [],
      },
      reasoning: parsed.reasoning || "Evaluation completed",
      questionId: question.id,
    };
  } catch (error: any) {
    console.error("[gemini] Answer evaluation error:", error);
    return {
      quality: "moderate",
      score: 3,
      signals: { good: [], moderate: [], poor: [] },
      reasoning: `Evaluation error: ${error.message || "Unknown error"}`,
      questionId: question.id,
    };
  }
}

export async function generateInterviewReport(
  candidateName: string,
  roleTitle: string,
  transcript: TranscriptEntry[],
  competencies: Competency[],
  questions: ScreeningQuestion[],
  competencyRatings: Record<string, number>,
  freeformNotes: string
): Promise<InterviewReport> {
  const transcriptText = transcript.map(t =>
    `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`
  ).join("\n");

  const competencyList = competencies.map(c => {
    const rating = competencyRatings[c.id] || 0;
    return `- ${c.name} (${c.description}): Rated ${rating}/5`;
  }).join("\n");

  const prompt = `You are an expert HR consultant generating a structured interview evaluation report.

CANDIDATE: ${candidateName}
ROLE: ${roleTitle}

COMPETENCIES ASSESSED:
${competencyList}

INTERVIEWER NOTES:
${freeformNotes || "No additional notes"}

INTERVIEW TRANSCRIPT:
${transcriptText || "No transcript available"}

Generate a comprehensive evaluation report. Be objective and evidence-based.

Respond with a JSON object:
{
  "summary": "A 2-3 paragraph executive summary of the interview and overall impression",
  "competencies": [
    {
      "competencyId": "comp_1",
      "name": "Technical Skills",
      "score": 4,
      "reason": "Demonstrated strong understanding of X with specific examples..."
    }
  ],
  "recommendation": {
    "decision": "Hire",
    "reason": "Based on the evidence, we recommend..."
  },
  "evidence": [
    {
      "point": "Candidate clearly articulated their approach to system design",
      "competency": "Technical Skills",
      "questionId": null
    }
  ]
}

Guidelines:
- Use the interviewer's ratings as input but adjust based on transcript evidence
- Provide specific evidence from the transcript for each score
- Look for Good, Moderate, and Poor signals in the transcript
- Be balanced - highlight both strengths and areas for improvement
- The decision should be "Hire", "No-Hire", or "Hold" and be well-justified
- Explicitly mention if it's a "Strong Hire" in the reason if the evidence is very strong.

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
    }

    const { text } = await generateTextWithRetries(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("[gemini] Failed to find JSON in report response. Full response:", text);
      throw new Error("Failed to parse AI response as JSON");
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "interview report");

    return {
      summary: parsed.summary || "Report generation incomplete.",
      competencies: (parsed.competencies || []).map((c: any) => ({
        competencyId: c.competencyId,
        name: c.name,
        score: Math.min(5, Math.max(1, c.score || competencyRatings[c.competencyId] || 3)),
        reason: c.reason,
      })),
      recommendation: {
        decision: parsed.recommendation?.decision || "Hold",
        reason: parsed.recommendation?.reason || "Unable to generate recommendation.",
      },
      evidence: (parsed.evidence || []).map((e: any) => ({
        point: e.point,
        competency: e.competency,
        questionId: e.questionId || null,
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("Report generation error:", error);

    const defaultCompetencies = competencies.map(c => ({
      competencyId: c.id,
      name: c.name,
      score: competencyRatings[c.id] || 3,
      reason: "Based on interviewer rating.",
    }));

    return {
      summary: "Interview completed. Report generation encountered an issue. Please review the transcript and interviewer notes for evaluation.",
      competencies: defaultCompetencies,
      recommendation: {
        decision: "Hold",
        reason: "Unable to generate AI recommendation. Please manually review the interview data.",
      },
      evidence: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
