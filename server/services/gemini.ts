import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Competency, ScreeningQuestion, InterviewReport, TranscriptEntry, AISuggestion, InterviewNotes, AnswerEvaluation, AIChatMessage } from "@shared/schema";

// =====================================================================
// CONFIGURATION & CONSTANTS
// =====================================================================

const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
if (!apiKey) {
  // Note: Using console.warn here since geminiLog isn't defined yet at module initialization
  console.warn("[gemini] WARNING: No API key found. Set GOOGLE_AI_API_KEY environment variable.");
}
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Word count thresholds for complexity classification
 * Used by autoCorrectComplexity for server-side validation
 */
const COMPLEXITY_THRESHOLDS = {
  simple: { maxWords: 25, maxConnectors: 0 },
  moderate: { maxWords: 40, maxConnectors: 1 },
  complex: { minWords: 50, minConnectors: 2 },
} as const;

/**
 * Maximum questions per AI generation batch to avoid token limits
 */
const MAX_QUESTIONS_PER_BATCH = 8;

// =====================================================================
// TYPE DEFINITIONS (for AI response parsing)
// =====================================================================

interface AIQuestionResponse {
  id?: string;
  competencyId: string;
  question: string;
  complexity?: "simple" | "moderate" | "complex";
  estimatedMinutes?: number;
  rubric: {
    typicalReasoning: string;
    goodSignals: string[];
    moderateSignals: string[];
    poorSignals: string[];
    notes: string;
  };
  isMandatory?: boolean;
  order?: number;
}

interface AICompetencyResponse {
  id?: string;
  name: string;
  description: string;
}

interface AITimeAnalysisResponse {
  totalMinutes: number;
  breakdown: { simple: number; moderate: number; complex: number };
  withinBudget: boolean;
  summary: string;
}

interface AIGenerationResponse {
  competencies: AICompetencyResponse[];
  questions: AIQuestionResponse[];
  timeAnalysis?: AITimeAnalysisResponse;
}

interface ComplexityCounts {
  simple: number;
  moderate: number;
  complex: number;
}

// =====================================================================
// UTILITY FUNCTIONS (reusable helpers)
// =====================================================================

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Calculate total minutes from questions' AI-assigned estimatedMinutes
 */
function calculateTotalMinutesFromQuestions(questions: Array<{ estimatedMinutes?: number }>): number {
  return questions.reduce((sum, q) => sum + (q.estimatedMinutes || 2.5), 0);
}

/**
 * Count questions by complexity level
 */
function countByComplexity(questions: Array<{ complexity?: string }>): ComplexityCounts {
  return {
    simple: questions.filter(q => q.complexity === "simple").length,
    moderate: questions.filter(q => q.complexity === "moderate").length,
    complex: questions.filter(q => q.complexity === "complex").length,
  };
}

/**
 * Generate standardized time summary string
 */
function generateTimeSummary(questionCount: number, totalMinutes: number): string {
  return `The screening consists of ${questionCount} questions, totaling ${totalMinutes.toFixed(1)} minutes of pure Q&A time. This calculation strictly covers the question-and-answer period and excludes introductions, follow-up probes, or closing remarks.`;
}

/**
 * Generate standardized time recommendation based on budget
 */
function generateTimeRecommendation(totalMinutes: number, budgetMinutes: number): string {
  const withinBudget = totalMinutes <= budgetMinutes;
  const difference = Math.abs(totalMinutes - budgetMinutes);
  
  if (withinBudget) {
    if (difference >= 2.0) {
      return `With a total of ${totalMinutes.toFixed(1)} minutes, you are ${difference.toFixed(0)} minutes under the ${budgetMinutes}-minute budget. This is an ideal buffer to allow for slight overages in candidate explanations without needing to remove any questions.`;
    }
    return `At ${totalMinutes.toFixed(1)} minutes, you are within your ${budgetMinutes}-minute Q&A budget with ${difference.toFixed(1)} minutes remaining. The timing is well-optimized.`;
  }
  
  const questionsToRemove = Math.ceil(difference / 2.5);
  return `At ${totalMinutes.toFixed(1)} minutes, you exceed the ${budgetMinutes}-minute budget by ${difference.toFixed(1)} minutes. Consider removing ${questionsToRemove} question(s) or extending the screening time to ${Math.ceil(totalMinutes)} minutes.`;
}

/**
 * Centralized logging for gemini service
 */
const geminiLog = {
  info: (msg: string, ...args: unknown[]) => console.log(`[gemini] ${msg}`, ...args),
  success: (msg: string, ...args: unknown[]) => console.log(`[gemini] ✓ ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[gemini] ⚠️ ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[gemini] ❌ ${msg}`, ...args),
};

/**
 * Extract the first balanced JSON object/array from text.
 * This avoids greedy regex grabs when the model includes extra braces/text.
 */
function extractJsonSubstring(input: string) {
  const text = String(input || "");
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) startIdx = firstBrace;
  else if (firstBracket !== -1) startIdx = firstBracket;
  if (startIdx === -1) return text.trim();

  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
    } else if (ch === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
    }

    if (stack.length === 0) {
      return text.substring(startIdx, i + 1).trim();
    }
  }

  // Truncated JSON; return from the first bracket to end (repairJsonText may close it).
  return text.substring(startIdx).trim();
}

/**
 * Attempts to repair common JSON errors made by AI models, 
 * including unquoted keys, single quotes, trailing commas, and unclosed structures.
 */
function repairJsonText(input: string) {
  let text = String(input || "").trim();
  if (!text) return text;

  // 0. Normalize "smart quotes" to ASCII quotes.
  text = text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  // 1. Strip markdown code fences if present.
  text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // 2. Extract only the first balanced JSON chunk.
  text = extractJsonSubstring(text);

  // 2b. Remove JS-style comments that sometimes appear in model output.
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  text = text.replace(/^\s*\/\/.*$/gm, "");

  // 3. Quote unquoted object keys: { key: ... } or , key:
  // Also handles keys with spaces/hyphens (e.g., good signals, question-id).
  text = text.replace(
    /([{,]\s*)([A-Za-z_][A-Za-z0-9_\- ]*?)(\s*:)/g,
    (_m, prefix, key, suffix) => `${prefix}"${String(key).trim()}"${suffix}`
  );

  // 4. Convert single-quoted keys/strings to double-quoted keys.
  // Be careful not to break internal apostrophes (not a perfect regex but handles simple cases).
  text = text.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
  text = text.replace(/:\s*'([^']*)'/g, (_match, value) => `: "${String(value).replace(/"/g, '\\"')}"`);

  // 5. Remove trailing commas.
  text = text.replace(/,\s*([}\]])/g, "$1");

  // 6. Normalize common non-JSON literals.
  text = text.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");

  // 7. Handle truncated JSON by closing open brackets/braces.
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // If we are left in a string, close it.
  if (inString) text += '"';

  // Close open structures in reverse order.
  // Note: This is an approximation; complex nested truncations might still fail.
  while (openBraces > 0 || openBrackets > 0) {
    // We need to guess which one to close. This simple logic closes based on count.
    // In reality, we'd need a stack of what was opened when.
    if (openBraces > 0) {
      text += '}';
      openBraces--;
    } else if (openBrackets > 0) {
      text += ']';
      openBrackets--;
    }
  }

  return text;
}

function safeJsonParse<T>(jsonText: string, context: string) {
  const extracted = extractJsonSubstring(jsonText);
  try {
    return JSON.parse(extracted) as T;
  } catch (error) {
    const repaired = repairJsonText(extracted);
    try {
      const parsed = JSON.parse(repaired) as T;
      geminiLog.warn(`JSON parse failed for ${context}. Repaired and parsed successfully.`);
      return parsed;
    } catch (repairError: unknown) {
      const errMsg = repairError instanceof Error ? repairError.message : "Unknown error";
      geminiLog.error(`JSON parse failed for ${context} after repair.`);
      geminiLog.error(`Error: ${errMsg}`);
      geminiLog.error(`Original text first 100 chars: ${extracted.substring(0, 100)}`);
      geminiLog.error(`Repaired text last 100 chars: ${repaired.substring(repaired.length - 100)}`);
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
  const preferred = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  const fallbacks = ["gemini-2.5-flash", "gemini-2.0-flash"];
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
      } catch (error: unknown) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        const msg = error instanceof Error ? error.message : String(error);
        geminiLog.error(`generateContent failed (model=${modelName}, attempt=${attempt}/${maxAttempts}): ${msg}`);

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
      } catch (error: unknown) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        const msg = error instanceof Error ? error.message : String(error);
        geminiLog.error(`sendMessage failed (model=${modelName}, attempt=${attempt}/${maxAttempts}): ${msg}`);

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
  questions: ScreeningQuestion[]
) {
  const validCompetencyIds = new Set(competencies.map((c) => c.id));

  // Fix missing/invalid competencyId by round-robin assignment.
  const safeCompetencyIds = competencies.length ? competencies.map((c) => c.id) : ["comp_fallback"];
  let rr = 0;
  const normalized = questions.map((q: any, idx) => {
    const competencyId =
      q.competencyId && validCompetencyIds.has(q.competencyId)
        ? q.competencyId
        : safeCompetencyIds[rr++ % safeCompetencyIds.length];

    let complexity = q.complexity || undefined;
    if (complexity && !["simple", "moderate", "complex"].includes(complexity)) {
      complexity = undefined;
    }
    const estimatedMinutes = typeof q.estimatedMinutes === "number" ? q.estimatedMinutes : 2.5;

    return {
      ...q,
      id: q.id || `q_${generateId()}`,
      competencyId,
      complexity,
      estimatedMinutes,
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

  return normalized;
}

/**
 * Calculate the maximum number of questions that can fit in the given time budget.
 * 
 * CRITICAL: interviewDuration is EXCLUSIVELY for planned Q&A screening questions
 * NOT included: introduction, follow-up questions, closing remarks
 * 
 * Uses weighted average based on recommended complexity mix
 * Returns both main questions and recommended buffer count
 */
function calculateMaxQuestions(interviewDuration?: number): number {
  if (typeof interviewDuration !== "number" || Number.isNaN(interviewDuration) || interviewDuration <= 0) {
    return 6;
  }

  const avgMinutesPerQuestion = 2.5;
  const maxQuestions = Math.max(1, Math.floor(interviewDuration / avgMinutesPerQuestion));
  
  geminiLog.info(`Time budget (Q&A only): ${interviewDuration} mins / ${avgMinutesPerQuestion.toFixed(1)} avg = ${maxQuestions} main questions`);
  
  return maxQuestions;
}

function recalculateMaxFromActualTimes(questions: Array<{ estimatedMinutes?: number }>, screeningTime: number): number {
  if (questions.length === 0) return calculateMaxQuestions(screeningTime);
  const avgActual = questions.reduce((s, q) => s + (q.estimatedMinutes || 2.5), 0) / questions.length;
  const recalculated = Math.max(1, Math.floor(screeningTime / avgActual));
  geminiLog.info(`Recalculated max from actual AI times: avg ${avgActual.toFixed(1)} min/Q => ${recalculated} questions for ${screeningTime} min`);
  return recalculated;
}

/**
 * Calculate number of buffer questions to generate (2-3 extra questions)
 * These are optional questions that can replace excluded main questions
 */
function calculateBufferQuestions(mainQuestions: number, totalMinutes?: number, screeningTime?: number): number {
  const baseBuffer = mainQuestions <= 5 ? 2 : 3;
  if (typeof totalMinutes === "number" && typeof screeningTime === "number" && totalMinutes > screeningTime) {
    const extraTime = totalMinutes - screeningTime;
    const extraBuffer = Math.floor(extraTime / 3);
    const adjusted = Math.min(baseBuffer + extraBuffer, mainQuestions);
    geminiLog.info(`Buffer: base ${baseBuffer} + ${extraBuffer} extra (${extraTime.toFixed(0)} min spare in total interview) = ${adjusted}`);
    return adjusted;
  }
  return baseBuffer;
}

/**
 * AUTO-CORRECT complexity classification based on objective metrics.
 * The AI often misclassifies complex questions as simple - this function fixes that.
 * 
 * Rules:
 * - SIMPLE: ≤25 words, no "AND/OR/versus" connecting topics, 1 concept
 * - MODERATE: ≤40 words, may have 1 "AND/OR/versus", 2 concepts
 * - COMPLEX: >40 words OR multiple "AND/OR/versus" OR 3+ concepts
 */
function autoCorrectComplexity(question: { question?: string; complexity?: string }): { 
  complexity: "simple" | "moderate" | "complex"; 
  corrected: boolean 
} {
  const text = question.question || "";
  const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
  
  // Count complexity escalators
  const andCount = (text.match(/\bAND\b/gi) || []).length;
  const orCount = (text.match(/\bOR\b/gi) || []).length;
  const versusCount = (text.match(/\bversus\b|\bvs\.?\b/gi) || []).length;
  const walkMeThrough = /walk\s+(me\s+)?through/i.test(text);
  const explainMultiple = /explain.*and.*and/i.test(text);
  
  // Count connecting words that indicate multiple concepts
  const connectorCount = andCount + orCount + versusCount;
  
  const originalComplexity = question.complexity || "moderate";
  let newComplexity: "simple" | "moderate" | "complex" = originalComplexity as "simple" | "moderate" | "complex";
  
  // Apply rules using COMPLEXITY_THRESHOLDS constants
  if (wordCount >= COMPLEXITY_THRESHOLDS.complex.minWords || 
      connectorCount >= COMPLEXITY_THRESHOLDS.complex.minConnectors || 
      explainMultiple) {
    // Definitely COMPLEX: long question OR multiple connectors
    newComplexity = "complex";
  } else if (wordCount > COMPLEXITY_THRESHOLDS.simple.maxWords || 
             connectorCount > COMPLEXITY_THRESHOLDS.simple.maxConnectors || 
             walkMeThrough) {
    // At least MODERATE: medium length OR has connectors OR "walk me through"
    if (newComplexity === "simple") {
      newComplexity = "moderate";
    }
  } else if (wordCount <= COMPLEXITY_THRESHOLDS.simple.maxWords && 
             connectorCount === 0 && 
             !walkMeThrough) {
    // Can stay SIMPLE: short, no connectors
    // Keep original if it was simple, otherwise don't downgrade
    if (originalComplexity !== "simple") {
      newComplexity = originalComplexity as "simple" | "moderate" | "complex";
    }
  }
  
  // Additional check: if marked as simple but has "walk me through" + multiple items
  if (originalComplexity === "simple" && walkMeThrough && (andCount > 0 || orCount > 0)) {
    newComplexity = "complex";
  }
  
  const corrected = newComplexity !== originalComplexity;
  if (corrected) {
    geminiLog.info(`Auto-corrected complexity: "${text.substring(0, 50)}..." from ${originalComplexity} → ${newComplexity} (${wordCount} words, ${connectorCount} connectors)`);
  }
  
  return {
    complexity: newComplexity,
    corrected
  };
}

/**
 * Calculate adaptive complexity distribution based on screening time.
 * Shorter interviews get more simple questions to fit within time budget.
 * Longer interviews can have more complex questions for deeper evaluation.
 * 
 * @param screeningTime - Q&A time budget in minutes
 * @param maxQuestions - Target number of main questions
 * @returns Object with simple, moderate, complex counts
 */
function getAdaptiveComplexityDistribution(screeningTime: number, maxQuestions: number): {
  simple: number;
  moderate: number;
  complex: number;
  simplePercent: number;
  moderatePercent: number;
  complexPercent: number;
} {
  // Adaptive percentages based on time budget
  let simplePercent: number;
  let moderatePercent: number;
  let complexPercent: number;
  
  if (screeningTime <= 10) {
    // Very short interview: prioritize simple questions
    simplePercent = 0.60;
    moderatePercent = 0.30;
    complexPercent = 0.10;
    geminiLog.info(`Short interview (≤10 min): Using 60/30/10 complexity distribution`);
  } else if (screeningTime <= 20) {
    // Standard interview: balanced distribution
    simplePercent = 0.40;
    moderatePercent = 0.40;
    complexPercent = 0.20;
    geminiLog.info(`Standard interview (11-20 min): Using 40/40/20 complexity distribution`);
  } else {
    // Longer interview: more complex questions for deeper evaluation
    simplePercent = 0.30;
    moderatePercent = 0.45;
    complexPercent = 0.25;
    geminiLog.info(`Longer interview (>20 min): Using 30/45/25 complexity distribution`);
  }
  
  // Calculate counts, ensuring at least 1 of each type if questions allow
  let simple = Math.round(maxQuestions * simplePercent);
  let moderate = Math.round(maxQuestions * moderatePercent);
  let complex = Math.round(maxQuestions * complexPercent);
  
  // Ensure total matches maxQuestions (handle rounding)
  const total = simple + moderate + complex;
  if (total < maxQuestions) {
    moderate += (maxQuestions - total);
  } else if (total > maxQuestions) {
    // Remove from complex first, then moderate
    const excess = total - maxQuestions;
    if (complex >= excess) {
      complex -= excess;
    } else {
      moderate -= (excess - complex);
      complex = 0;
    }
  }
  
  return { simple, moderate, complex, simplePercent, moderatePercent, complexPercent };
}

function validateTimelineFit(
  questions: ScreeningQuestion[],
  interviewDuration: number,
  context: string
): void {
  const mandatory = questions.filter(q => q.isMandatory !== false);
  const estimatedTime = calculateTotalMinutesFromQuestions(mandatory);
  
  geminiLog.info(`${context}: ${mandatory.length} Q&A questions, estimated ${estimatedTime.toFixed(1)} min (budget: ${interviewDuration} min)`);
  
  if (estimatedTime > interviewDuration) {
    geminiLog.warn(`${context}: Exceeds budget by ${(estimatedTime - interviewDuration).toFixed(1)} min`);
  } else {
    geminiLog.success(`${context}: Within budget (${(interviewDuration - estimatedTime).toFixed(1)} min remaining)`);
  }
}

function clampEstimatedMinutes(questions: ScreeningQuestion[]): ScreeningQuestion[] {
  return questions.map(q => {
    let est = q.estimatedMinutes || 2.5;
    if (est < 0.5) est = 0.5;
    if (est > 6.0) est = 6.0;
    if (est !== q.estimatedMinutes) {
      geminiLog.info(`Clamped time for "${q.question?.substring(0, 40)}...": ${q.estimatedMinutes} → ${est} min`);
    }
    return { ...q, estimatedMinutes: est };
  });
}

function ensureComplexityAssigned(questions: ScreeningQuestion[]): ScreeningQuestion[] {
  return questions.map(q => {
    if (q.complexity && ["simple", "moderate", "complex"].includes(q.complexity)) {
      const correction = autoCorrectComplexity(q);
      if (correction.corrected) {
        return { ...q, complexity: correction.complexity };
      }
      return q;
    }
    const { complexity } = autoCorrectComplexity(q);
    geminiLog.info(`Auto-assigned complexity for "${q.question?.substring(0, 40)}...": ${complexity}`);
    return { ...q, complexity };
  });
}

function smartTrimForTimeBudget(
  mandatory: ScreeningQuestion[],
  screeningTime: number,
  maxQuestions: number
): ScreeningQuestion[] {
  const totalTime = calculateTotalMinutesFromQuestions(mandatory);
  
  if (totalTime <= screeningTime && mandatory.length <= maxQuestions) {
    geminiLog.success(`Q&A questions fit within time budget: ${totalTime.toFixed(1)}/${screeningTime} min`);
    return mandatory;
  }
  
  geminiLog.warn(`Trimming: ${totalTime.toFixed(1)} min > ${screeningTime} min budget OR ${mandatory.length} > ${maxQuestions} max`);
  
  const competencyCoverage = new Map<string, number>();
  mandatory.forEach(q => {
    const comp = q.competencyId || "unknown";
    competencyCoverage.set(comp, (competencyCoverage.get(comp) || 0) + 1);
  });
  
  let adjusted = [...mandatory];
  
  while (calculateTotalMinutesFromQuestions(adjusted) > screeningTime || adjusted.length > maxQuestions) {
    if (adjusted.length <= 1) break;
    
    let bestRemovalIdx = -1;
    let bestScore = -Infinity;
    
    for (let i = 0; i < adjusted.length; i++) {
      const q = adjusted[i];
      const comp = q.competencyId || "unknown";
      const compCount = competencyCoverage.get(comp) || 1;
      
      let removalScore = 0;
      removalScore += (q.estimatedMinutes || 2.5) * 2;
      if (compCount > 1) removalScore += 5;
      if (compCount <= 1) removalScore -= 10;
      if (q.complexity === "complex") removalScore += 1;
      if (q.complexity === "simple") removalScore -= 1;
      
      if (removalScore > bestScore) {
        bestScore = removalScore;
        bestRemovalIdx = i;
      }
    }
    
    if (bestRemovalIdx >= 0) {
      const removed = adjusted[bestRemovalIdx];
      const comp = removed.competencyId || "unknown";
      const currentCount = competencyCoverage.get(comp) || 0;
      competencyCoverage.set(comp, Math.max(0, currentCount - 1));
      geminiLog.info(`Removed Q: "${removed.question?.substring(0, 50)}..." (${removed.estimatedMinutes?.toFixed(1)} min, comp: ${comp})`);
      adjusted.splice(bestRemovalIdx, 1);
    } else {
      break;
    }
  }
  
  const finalTime = calculateTotalMinutesFromQuestions(adjusted);
  const remainingComps = new Set(adjusted.map(q => q.competencyId)).size;
  geminiLog.info(`Trimmed to ${adjusted.length} questions, ${finalTime.toFixed(1)}/${screeningTime} min, covering ${remainingComps} competencies`);
  
  return adjusted;
}

function fillRemainingTime(
  selected: ScreeningQuestion[],
  available: ScreeningQuestion[],
  screeningTime: number,
  maxQuestions: number
): ScreeningQuestion[] {
  const currentTime = calculateTotalMinutesFromQuestions(selected);
  const remainingTime = screeningTime - currentTime;
  
  if (remainingTime < 1.0 || selected.length >= maxQuestions) return selected;
  
  const selectedIds = new Set(selected.map(q => q.id));
  const coveredComps = new Map<string, number>();
  selected.forEach(q => {
    const comp = q.competencyId || "unknown";
    coveredComps.set(comp, (coveredComps.get(comp) || 0) + 1);
  });
  
  const candidates = available
    .filter(q => !selectedIds.has(q.id))
    .filter(q => (q.estimatedMinutes || 2.5) <= remainingTime)
    .sort((a, b) => {
      const aComp = a.competencyId || "unknown";
      const bComp = b.competencyId || "unknown";
      const aCount = coveredComps.get(aComp) || 0;
      const bCount = coveredComps.get(bComp) || 0;
      if (aCount !== bCount) return aCount - bCount;
      return (a.estimatedMinutes || 2.5) - (b.estimatedMinutes || 2.5);
    });
  
  let result = [...selected];
  let usedTime = currentTime;
  
  for (const candidate of candidates) {
    if (result.length >= maxQuestions) break;
    const est = candidate.estimatedMinutes || 2.5;
    if (usedTime + est <= screeningTime) {
      result.push(candidate);
      usedTime += est;
      const comp = candidate.competencyId || "unknown";
      coveredComps.set(comp, (coveredComps.get(comp) || 0) + 1);
      geminiLog.info(`Filled gap: added "${candidate.question?.substring(0, 40)}..." (${est.toFixed(1)} min)`);
    }
  }
  
  if (result.length > selected.length) {
    geminiLog.info(`Filled ${result.length - selected.length} questions into remaining ${remainingTime.toFixed(1)} min gap`);
  }
  
  return result;
}

function enforceTimeBudget(
  questions: ScreeningQuestion[],
  interviewDuration?: number,
  totalMinutes?: number
) {
  const screeningTime = interviewDuration || 15;
  
  questions = clampEstimatedMinutes(questions);
  questions = ensureComplexityAssigned(questions);
  
  const mandatory = questions.filter(q => q.isMandatory !== false);
  const buffer = questions.filter(q => q.isMandatory === false);
  
  const fixedMax = calculateMaxQuestions(interviewDuration);
  const actualMax = recalculateMaxFromActualTimes(mandatory, screeningTime);
  const maxQuestions = mandatory.length > 0 ? actualMax : fixedMax;
  const bufferCount = calculateBufferQuestions(maxQuestions, totalMinutes, screeningTime);
  
  geminiLog.info(`Max questions: ${maxQuestions} (from actual times), buffer target: ${bufferCount}`);
  
  let trimmedMandatory = smartTrimForTimeBudget(mandatory, screeningTime, maxQuestions);
  
  trimmedMandatory = fillRemainingTime(trimmedMandatory, mandatory, screeningTime, maxQuestions);
  
  let trimmedBuffer = buffer;
  if (buffer.length > bufferCount) {
    trimmedBuffer = buffer.slice(0, bufferCount);
  }
  
  if (trimmedBuffer.length < bufferCount && mandatory.length > trimmedMandatory.length) {
    const trimmedIds = new Set(trimmedMandatory.map(q => q.id));
    const bufferIds = new Set(trimmedBuffer.map(q => q.id));
    const demoted = mandatory.filter(q => !trimmedIds.has(q.id) && !bufferIds.has(q.id));
    for (const q of demoted) {
      if (trimmedBuffer.length >= bufferCount) break;
      trimmedBuffer.push({ ...q, isMandatory: false });
      geminiLog.info(`Demoted to buffer: "${q.question?.substring(0, 40)}..."`);
    }
  }
  
  const combined = [...trimmedMandatory, ...trimmedBuffer].map((q, idx) => ({
    ...q,
    order: idx + 1,
  }));
  
  const finalTime = calculateTotalMinutesFromQuestions(trimmedMandatory);
  const utilization = ((finalTime / screeningTime) * 100).toFixed(0);
  geminiLog.info(`Final: ${trimmedMandatory.length} main (${finalTime.toFixed(1)}/${screeningTime} min, ${utilization}% utilized) + ${trimmedBuffer.length} buffer = ${combined.length} total`);
  
  return combined;
}

/**
 * Extract competencies and generate screening questions from job description.
 * 
 * @param interviewDuration - EXCLUSIVELY for planned Q&A screening questions
 *                            Does NOT include: introduction, follow-up questions, closing
 *                            This is the pure Q&A time budget for planned questions only
 */
export async function extractCompetenciesAndQuestions(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  location?: string,
  interviewDuration?: number,
  existingQuestions?: ScreeningQuestion[],
  chatHistory: AIChatMessage[] = [],
  totalMinutes?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  const screeningTime = interviewDuration || 15;

  geminiLog.info(`Will generate questions for ${screeningTime} min Q&A time`);

  const existingQuestionTexts = (existingQuestions || [])
    .map((q) => q?.question)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  const existingQuestionKeys = new Set(existingQuestionTexts.map(normalizeQuestionKey).filter(Boolean));

  const existingQuestionsSection = existingQuestions && existingQuestions.length > 0
    ? `\n\nEXISTING QUESTIONS (DO NOT DUPLICATE THESE):\n${existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n`
    : '';

  const prompt = `You are a subject matter expert in the role that is being hired. Review the following Job Description for context.

JOB DESCRIPTION:
${jdText || "No JD provided"}

LOCATION: ${location || "Not specified"}

${smeNotes ? `Here are also some notes from the Subject Matter Expert for more context:\n${smeNotes}` : ''}
${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}` : ''}
${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}` : ''}
${existingQuestionsSection}

You are wanting your hiring manager to ask some skills & experience specific questions that are easy for them to ask without subject matter expertise. During a screening conversation the questions, thinking time and answers between the Hiring Manager and Candidate must take no longer than ${screeningTime} minutes (give buffer for human reason).

According to all of this create questions with expected answers and a screening criteria (Good-fit answer, moderate-fit answer, bad-fit answer) that will be easy for the hiring manager to ask and also conclude if the candidate is a good-fit. Questions can be scenario based or actually asking about a skill directly.

MAXIMIZE MANDATORY QUESTIONS: Your primary goal is to fit as many mandatory questions as possible within the ${screeningTime}-minute screening time. Do NOT generate just 3 long questions when you could fit 5-6 shorter, focused ones. After filling the mandatory budget, include 2-3 additional optional questions (marked "isMandatory": false) that the Hiring Manager may choose to swap in.

The objective from this is so that the hiring manager can save time of the subject matter expert employees by reducing candidates that are clearly not a good-fit and ones that just answer buzzwords and lack needed experience/knowledge.

IMPORTANT GUIDELINES:
1. The TOTAL time for ALL mandatory questions must fit within ${screeningTime} minutes including asking time, candidate thinking time, and answering time.
2. For each question, estimate the realistic time in minutes it would take (asking + thinking + answering). Do NOT use fixed/hardcoded values - estimate based on the actual question complexity and scope.
3. QUESTION DESIGN: Keep each question focused on ONE specific skill or scenario — target 3-4 minutes per question rather than 6-7 minute questions. This means a ${screeningTime}-minute budget should fit approximately ${Math.floor(screeningTime / 3.5)} mandatory questions. If you can fit more by keeping questions concise, do so.
4. Extract 3-5 key competencies directly from the JD.
5. Every question must reference SPECIFIC technologies, tools, or responsibilities from the JD.
6. Questions must test PRACTICAL EXPERIENCE, not theoretical knowledge.
7. Include exactly 5 signals each for goodSignals, moderateSignals, and poorSignals in each rubric.
8. NO culture-fit, soft-skills, or reverse questions. Focus exclusively on technical/domain competency.
9. Each question must be unique and non-repetitive.

For each question provide:
- A clear, scenario-based question tied to the JD
- "estimatedMinutes": a realistic estimate of how long this question takes (asking + thinking + answering)
- A rubric with:
  - "typicalReasoning": 2-4 sentences on what practical skill this probes and what a strong answer demonstrates
  - "goodSignals": 5 specific indicators of hands-on expertise
  - "moderateSignals": 5 indicators of surface-level knowledge
  - "poorSignals": 5 red flags showing lack of real experience
  - "notes": follow-up probing questions for the HR person

Also include a timeAnalysis object that verifies whether all mandatory questions fit within the ${screeningTime} minute budget.

Produce this in a JSON Format:
{
  "competencies": [
    { "id": "comp_1", "name": "...", "description": "..." }
  ],
  "questions": [
    {
      "id": "q_1",
      "competencyId": "comp_1",
      "question": "...",
      "estimatedMinutes": <realistic time estimate>,
      "rubric": {
        "typicalReasoning": "...",
        "goodSignals": ["...", "...", "...", "...", "..."],
        "moderateSignals": ["...", "...", "...", "...", "..."],
        "poorSignals": ["...", "...", "...", "...", "..."],
        "notes": "..."
      },
      "isMandatory": true,
      "order": 1
    }
  ],
  "timeAnalysis": {
    "totalEstimatedMinutes": <sum of mandatory question estimatedMinutes>,
    "withinBudget": <true if total <= ${screeningTime}>,
    "summary": "<2-3 sentence summary of the time breakdown>"
  }
}

Only output valid JSON. No markdown code blocks.`;

  const strictJsonSuffix =
    "\n\nIMPORTANT: Output ONLY valid JSON. Use double quotes for all keys/strings. Do not add markdown, code fences, or trailing text. Do not include trailing commas.";

  try {
    const { text, modelName, history: updatedHistory } = await sendMessageWithRetries(prompt, chatHistory);

    geminiLog.info(`Raw AI response length: ${text.length}`);
    geminiLog.info(`Raw AI response preview: ${text.substring(0, 200)}`);
    geminiLog.info(`Model used: ${modelName}`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      geminiLog.error(`Failed to find JSON in response. Full response: ${text}`);
      throw new Error("Failed to parse AI response as JSON");
    }

    const parseResponse = (jsonText: string) => {
      const parsed = safeJsonParse<any>(jsonText, "competencies/questions");
      const competencies: Competency[] = (parsed.competencies || []).map((c: any) => ({
        id: c.id || `comp_${generateId()}`,
        name: c.name,
        description: c.description,
      }));
      
      const questions: ScreeningQuestion[] = (parsed.questions || []).map((q: any, idx: number) => {
        return {
          id: q.id || `q_${generateId()}`,
          competencyId: q.competencyId,
          question: q.question,
          complexity: q.complexity || undefined,
          estimatedMinutes: typeof q.estimatedMinutes === "number" ? q.estimatedMinutes : 2.5,
          rubric: q.rubric || { typicalReasoning: "", goodSignals: [], moderateSignals: [], poorSignals: [], notes: "" },
          isMandatory: q.isMandatory ?? true,
          order: q.order || idx + 1,
        };
      });
      
      const timeAnalysis = parsed.timeAnalysis || null;
      return { competencies, questions, timeAnalysis };
    };

    let competencies: Competency[] = [];
    let questions: ScreeningQuestion[] = [];
    let aiTimeAnalysis: any = null;
    try {
      const parsed = parseResponse(jsonMatch[0]);
      competencies = parsed.competencies;
      questions = parsed.questions;
      aiTimeAnalysis = parsed.timeAnalysis;
    } catch (parseError) {
      geminiLog.warn("Initial JSON parse failed. Retrying with strict JSON request.");
      const strict = await generateTextWithRetries(`${prompt}${strictJsonSuffix}`);
      const strictMatch = strict.text.match(/\{[\s\S]*\}/);
      if (!strictMatch) {
        geminiLog.error(`Failed to find JSON in strict response. Full response: ${strict.text}`);
        throw parseError;
      }
      const parsed = parseResponse(strictMatch[0]);
      competencies = parsed.competencies;
      questions = parsed.questions;
      aiTimeAnalysis = parsed.timeAnalysis;
    }
    
    // Log AI's time analysis if provided
    if (aiTimeAnalysis) {
      geminiLog.info(`AI Time Analysis: ${aiTimeAnalysis.totalMinutes} min, within budget: ${aiTimeAnalysis.withinBudget}`);
      geminiLog.info(`AI Breakdown: ${aiTimeAnalysis.summary || JSON.stringify(aiTimeAnalysis.breakdown)}`);
    }

    const mandatoryQuestions = questions.filter(q => q.isMandatory !== false);
    const bufferQuestionsGenerated = questions.filter(q => q.isMandatory === false);
    
    geminiLog.info(`AI generated ${questions.length} total questions`);
    geminiLog.info(`- Main questions: ${mandatoryQuestions.length}`);
    geminiLog.info(`- Buffer questions: ${bufferQuestionsGenerated.length}`);
    
    const actualTime = calculateTotalMinutesFromQuestions(mandatoryQuestions);
    geminiLog.info(`AI-estimated Q&A time: ${actualTime.toFixed(1)} min`);
    geminiLog.info(`Q&A budget: ${screeningTime} min (excludes intro/follow-ups)`);

    questions = normalizeQuestions(competencies, questions);
    questions = dedupeByQuestionText(questions);
    
    if (existingQuestionKeys.size) {
      const beforeFilter = questions.length;
      questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
      geminiLog.info(`Filtered out ${beforeFilter - questions.length} duplicate questions`);
    }

    // Ensure rubric signal arrays have enough points (exactly or at least 5 each -- target 5).
    const minSignals = 5;
    if (questions.some((q) => !rubricMeetsMinSignals(q, minSignals))) {
      geminiLog.warn(`Rubric signals below minimum (${minSignals}). Attempting rubric expansion/fix.`);

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
- **FORBIDDEN in typicalReasoning:** No time estimates (e.g., "should take 2 minutes", "answered in under X minutes", "within X minutes")
- Keep id, competencyId, question, isMandatory, and order unchanged.
- Do NOT add or remove any questions. Keep exactly ${questions.length} questions.

Respond with ONLY the full JSON object in the same format. No markdown.`;

      const expanded = await generateTextWithRetries(expandRubricsPrompt);
      const expandedMatch = expanded.text.match(/\{[\s\S]*\}/);
      if (expandedMatch) {
        const expandedParsed = parseResponse(expandedMatch[0]);
        competencies = expandedParsed.competencies;
        questions = normalizeQuestions(expandedParsed.competencies, expandedParsed.questions);
        questions = dedupeByQuestionText(questions);
        if (existingQuestionKeys.size) {
          questions = questions.filter((q) => !existingQuestionKeys.has(normalizeQuestionKey(q.question)));
        }
        questions = questions.map((q, idx) => ({ ...q, order: idx + 1 }));
      }
    }

    questions = questions.map((q, idx) => ({ ...q, order: idx + 1 }));
    questions = enforceTimeBudget(questions, interviewDuration, totalMinutes);

    const finalMandatory = questions.filter(q => q.isMandatory !== false);
    const finalBuffer = questions.filter(q => q.isMandatory === false);
    const finalEstimatedTime = calculateTotalMinutesFromQuestions(finalMandatory);
    
    geminiLog.info(`Final: ${finalMandatory.length} main + ${finalBuffer.length} buffer = ${questions.length} total`);
    
    if (finalEstimatedTime > screeningTime) {
      geminiLog.warn(`Q&A time (${finalEstimatedTime.toFixed(1)} min) exceeds budget (${screeningTime} min)`);
    } else {
      const utilization = ((finalEstimatedTime / screeningTime) * 100).toFixed(0);
      geminiLog.success(`Q&A time: ${finalEstimatedTime.toFixed(1)}/${screeningTime} min (${utilization}% utilized)`);
    }

    return { competencies, questions, history: updatedHistory };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    const errStack = error instanceof Error ? error.stack : undefined;
    const errName = error instanceof Error ? error.name : "Error";
    geminiLog.error(`AI API error: ${errMsg}`);
    geminiLog.error(`Error details: ${JSON.stringify({ message: errMsg, stack: errStack, name: errName })}`);

    if (errMsg?.includes("API key")) {
      throw new Error("Invalid or missing Google AI API key. Please check your GOOGLE_AI_API_KEY environment variable.");
    }

    throw new Error(`AI generation failed: ${errMsg}`);
  }
}

/**
 * Batched version of extractCompetenciesAndQuestions for large interview durations.
 * Splits question generation into multiple batches to avoid AI output token limits.
 * 
 * @param interviewDuration - Q&A time budget in minutes (>30 min typically needs batching)
 */
async function extractCompetenciesAndQuestionsBatched(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  location?: string,
  interviewDuration?: number,
  existingQuestions?: ScreeningQuestion[],
  chatHistory: AIChatMessage[] = [],
  totalMinutesParam?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  const maxQuestions = calculateMaxQuestions(interviewDuration);
  const screeningTimeForBuffer = interviewDuration || 15;
  const bufferQuestions = calculateBufferQuestions(maxQuestions, totalMinutesParam, screeningTimeForBuffer);
  const totalQuestions = maxQuestions + bufferQuestions;
  const screeningTime = interviewDuration || 15;
  
  geminiLog.info(`Batched generation: ${totalQuestions} questions in batches of ${MAX_QUESTIONS_PER_BATCH}`);
  
  // Calculate how many batches we need
  const numBatches = Math.ceil(totalQuestions / MAX_QUESTIONS_PER_BATCH);
  const questionsPerBatch = Math.ceil(totalQuestions / numBatches);
  
  let allQuestions: ScreeningQuestion[] = [];
  let competencies: Competency[] = [];
  let currentHistory = [...chatHistory];
  
  // Track existing questions to avoid duplicates
  const existingQuestionTexts = (existingQuestions || [])
    .map((q) => q?.question)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  const existingQuestionKeys = new Set(existingQuestionTexts.map(normalizeQuestionKey).filter(Boolean));
  
  for (let batch = 0; batch < numBatches; batch++) {
    const batchNum = batch + 1;
    const questionsNeeded = Math.min(questionsPerBatch, totalQuestions - allQuestions.length);
    const isFirstBatch = batch === 0;
    
    geminiLog.info(`Generating batch ${batchNum}/${numBatches}: ${questionsNeeded} questions`);
    
    // For the first batch, get competencies too
    // For subsequent batches, only get questions using the established competencies
    const batchPrompt = isFirstBatch
      ? buildFirstBatchPrompt(jdText, smeNotes, customInstructions, companyWebsite, location, questionsNeeded, screeningTime, existingQuestions)
      : buildSubsequentBatchPrompt(jdText, competencies, questionsNeeded, allQuestions, screeningTime);
    
    try {
      const { text, history: updatedHistory } = await sendMessageWithRetries(batchPrompt, currentHistory);
      currentHistory = updatedHistory;
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        geminiLog.error(`Batch ${batchNum}: Failed to find JSON in response`);
        continue;
      }
      
      const parsed = safeJsonParse<AIGenerationResponse>(jsonMatch[0], `batch ${batchNum}`);
      
      // Extract competencies from first batch
      if (isFirstBatch && parsed.competencies) {
        competencies = parsed.competencies.map((c: AICompetencyResponse) => ({
          id: c.id || `comp_${generateId()}`,
          name: c.name,
          description: c.description,
        }));
      }
      
      // Process questions with auto-correction
      const batchQuestions = (parsed.questions || []).map((q: AIQuestionResponse, idx: number) => {
        let complexity = q.complexity || "moderate";
        if (!["simple", "moderate", "complex"].includes(complexity)) {
          complexity = "moderate";
        }
        
        return {
          id: q.id || `q_${generateId()}`,
          competencyId: q.competencyId || competencies[idx % competencies.length]?.id || "comp_1",
          question: q.question,
          complexity,
          estimatedMinutes: typeof q.estimatedMinutes === "number" ? q.estimatedMinutes : 2.5,
          rubric: q.rubric || { typicalReasoning: "", goodSignals: [], moderateSignals: [], poorSignals: [], notes: "" },
          isMandatory: allQuestions.length + idx < maxQuestions, // First maxQuestions are mandatory
          order: allQuestions.length + idx + 1,
        };
      });
      
      // Filter duplicates
      const filteredBatch = batchQuestions.filter((q: ScreeningQuestion) => {
        const key = normalizeQuestionKey(q.question);
        if (existingQuestionKeys.has(key)) return false;
        existingQuestionKeys.add(key);
        return true;
      });
      
      allQuestions = [...allQuestions, ...filteredBatch];
      geminiLog.info(`Batch ${batchNum} complete: ${filteredBatch.length} questions added (total: ${allQuestions.length})`);
      
    } catch (error) {
      geminiLog.error(`Batch ${batchNum} failed:`, error);
      // Continue with remaining batches
    }
  }
  
  // Ensure proper ordering and mandatory flags
  allQuestions = allQuestions.map((q, idx) => ({
    ...q,
    isMandatory: idx < maxQuestions,
    order: idx + 1,
  }));
  
  allQuestions = enforceTimeBudget(allQuestions, interviewDuration, totalMinutesParam);
  
  const finalTime = calculateTotalMinutesFromQuestions(allQuestions.filter(q => q.isMandatory));
  
  geminiLog.success(`Batched generation complete: ${allQuestions.length} questions, ${finalTime.toFixed(1)} min Q&A time`);
  
  return { competencies, questions: allQuestions, history: currentHistory };
}

/**
 * Build prompt for the first batch (includes competency extraction)
 */
function buildFirstBatchPrompt(
  jdText: string,
  smeNotes: string | undefined,
  customInstructions: string | undefined,
  companyWebsite: string | undefined,
  location: string | undefined,
  questionsNeeded: number,
  screeningTime: number,
  existingQuestions?: ScreeningQuestion[]
): string {
  const existingQuestionsSection = existingQuestions && existingQuestions.length > 0
    ? `\n\nEXISTING QUESTIONS (DO NOT DUPLICATE):\n${existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n`
    : '';
    
  return `You are a subject matter expert. Generate ${questionsNeeded} screening questions for this role.

JOB DESCRIPTION:
${jdText || "No JD provided"}

${smeNotes ? `SME NOTES:\n${smeNotes}\n` : ''}
${customInstructions ? `CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ''}
${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}\n` : ''}
LOCATION: ${location || "Not specified"}
${existingQuestionsSection}

REQUIREMENTS:
1. Extract 3-5 key competencies from the JD
2. Generate exactly ${questionsNeeded} scenario-based questions
3. For EACH question, estimate realistic time in minutes (asking + thinking + answering). Do NOT use fixed values - estimate based on actual question complexity and scope.
4. KEEP QUESTIONS FOCUSED AND CONCISE: Target 3-4 minutes per question. Ask about ONE specific skill or scenario per question, not multiple topics combined. This maximizes coverage across competencies within the ${screeningTime}-minute screening time budget.
5. Include detailed rubrics with exactly 5 signals each (goodSignals, moderateSignals, poorSignals)
6. Mark questions that fit within the ${screeningTime}-minute time budget as "isMandatory": true. Mark any extras beyond the budget as "isMandatory": false.

Respond with JSON:
{
  "competencies": [{ "id": "comp_1", "name": "...", "description": "..." }],
  "questions": [{
    "id": "q_1",
    "competencyId": "comp_1",
    "question": "...",
    "estimatedMinutes": <realistic time estimate>,
    "rubric": {
      "typicalReasoning": "...",
      "goodSignals": ["...", "...", "...", "...", "..."],
      "moderateSignals": ["...", "...", "...", "...", "..."],
      "poorSignals": ["...", "...", "...", "...", "..."],
      "notes": "..."
    },
    "isMandatory": true,
    "order": 1
  }]
}

Only output valid JSON. No markdown.`;
}

/**
 * Build prompt for subsequent batches (uses existing competencies)
 */
function buildSubsequentBatchPrompt(
  jdText: string,
  competencies: Competency[],
  questionsNeeded: number,
  existingQuestions: ScreeningQuestion[],
  screeningTime: number
): string {
  const competencyList = competencies.map(c => `- ${c.id}: ${c.name}`).join('\n');
  const existingList = existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
  
  return `Continue generating ${questionsNeeded} MORE screening questions for this role.

JOB DESCRIPTION:
${jdText}

USE THESE COMPETENCIES (already extracted):
${competencyList}

ALREADY GENERATED (DO NOT REPEAT):
${existingList}

REQUIREMENTS:
1. Generate exactly ${questionsNeeded} NEW unique questions
2. Distribute across the existing competencies
3. For EACH question, estimate realistic time in minutes (asking + thinking + answering). Do NOT use fixed values.
4. KEEP QUESTIONS FOCUSED AND CONCISE: Target 3-4 minutes per question. Ask about ONE specific skill or scenario per question, not multiple topics combined.
5. Include detailed rubrics with exactly 5 signals each
6. All questions in this batch should be marked "isMandatory": true.

Respond with JSON (NO competencies array, only questions):
{
  "questions": [{
    "id": "q_${existingQuestions.length + 1}",
    "competencyId": "comp_1",
    "question": "...",
    "estimatedMinutes": <realistic time estimate>,
    "rubric": { ... },
    "isMandatory": true,
    "order": ${existingQuestions.length + 1}
  }]
}

Only output valid JSON. No markdown.`;
}

export async function regenerateQuestionsWithInstructions(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  location?: string,
  interviewDuration?: number,
  existingQuestions?: ScreeningQuestion[],
  chatHistory: AIChatMessage[] = [],
  totalMinutes?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  return extractCompetenciesAndQuestions(
    jdText,
    smeNotes,
    customInstructions,
    companyWebsite,
    location,
    interviewDuration,
    existingQuestions,
    chatHistory,
    totalMinutes
  );
}

export async function refineIndividualQuestion(
  jdText: string,
  question: ScreeningQuestion,
  instructions: string,
  chatHistory: AIChatMessage[] = []
): Promise<{ question: ScreeningQuestion; history: AIChatMessage[] }> {
  const prompt = `As a subject matter expert, refine the following screening interview question based on the custom instructions and the Job Description.

JOB DESCRIPTION:
${jdText}

CURRENT QUESTION:
${JSON.stringify(question, null, 2)}

CUSTOM INSTRUCTIONS:
${instructions}

Instructions:
1. **Make the question STRONGER and MORE SPECIFIC to the JD:**
   - Transform into a SCENARIO-BASED question that tests practical experience
   - Reference EXACT technologies, tools, or frameworks mentioned in the JD
   - Tie the question to SPECIFIC responsibilities or requirements from the JD
   - Frame as a REAL PROBLEM: debugging, trade-offs, optimization, or production issues
   - Replace generic terms with JD-specific terms (e.g., "FastAPI" not "Python framework")
   - Avoid generic phrasing that could apply to any role
   - **Transform weak questions**: "How do you X?" → "When X breaks/slows down, how do you diagnose and fix it?"
   - ABSOLUTELY NO CULTURE-FIT, BEHAVIORAL SOFT-SKILLS, OR REVERSE QUESTIONS
2. **Ensure the refined question can be answered in approximately 2-3 minutes** - avoid overly broad questions requiring 10+ minute answers.

3. **Update the rubric to be JD-SPECIFIC:**
   - typicalReasoning: A short paragraph (2–4 sentences) that references SPECIFIC technologies from the JD. Use direct statements with JD-specific terms ("A strong answer will mention FastAPI's HTTPException..." not "will handle errors"). **FORBIDDEN: DO NOT mention time estimates like "should take X minutes" or "answered in under X minutes".**
   
   - goodSignals: Exactly 5 highly specific points using EXACT tools/frameworks from the JD (e.g., "BEST: Mentions using 'React Query' for server state management" if React Query is in the JD, NOT "uses a state management library").
   
   - moderateSignals: Exactly 5 points showing technically correct but JD-generic answers (e.g., "MODERATE: Describes caching generally without mentioning Redis" if Redis is in the JD).
   
   - poorSignals: Exactly 5 red flags including JD-misaligned approaches (e.g., "RED FLAG: Suggests using jQuery when the stack is React-based").
   
   - notes: Specific probing questions using JD terminology.

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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    geminiLog.error(`Refine question error: ${errMsg}`);
    throw error;
  }
}

export async function refineJobDescription(jdText: string): Promise<{ refinedJd: string, suggestedTitle: string }> {
  const prompt = `You are an expert HR consultant and technical recruiter.
  
  Your task is to refine the following Job Description (JD) and suggest a standard, concise job title.
  Some users might paste a lot of clutter like company history, benefits, internal administrative details, or legal disclaimers.
  
  Please extract and keep ONLY the relevant job description points, such as:
  - Key roles and responsibilities
  - Required technical skills and qualifications
  - Preferred skills and experience
  
  Discard:
  - Company history or "About Us" deep-dives (unless role-specific context)
  - Detailed benefits list (insurance, gym memberships, etc)
  - Application instructions or legal disclaimers
  
  Also, extract a clear, industry-standard JOB TITLE (e.g. "Senior Frontend Engineer", "Product Manager").
  
  FORMATTING:
  - Return the results as a JSON object.
  - refinedJd: The refined JD in a clean, bulleted format.
  - suggestedTitle: A concise, professional job title.
  
  JOB DESCRIPTION TO REFINE:
  ${jdText}
  
  Respond with ONLY a JSON object:
  {
    "refinedJd": "...",
    "suggestedTitle": "..."
  }
  
  Only output valid JSON. No extra commentary.`;

  try {
    const { text } = await generateTextWithRetries(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { refinedJd: text.trim(), suggestedTitle: "" };
    }
    const parsed = safeJsonParse<any>(jsonMatch[0], "refined JD and title");
    return {
      refinedJd: (parsed.refinedJd || "").trim(),
      suggestedTitle: (parsed.suggestedTitle || "").trim()
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    geminiLog.error(`Refine JD error: ${errMsg}`);
    throw error;
  }
}

export async function refineMultipleQuestions(
  jdText: string,
  questions: ScreeningQuestion[],
  instructions: string,
  smeNotes?: string,
  interviewDuration?: number,
  chatHistory: AIChatMessage[] = []
): Promise<{ questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  const batchSize = 3;
  const totalQuestions = questions.length;
  const refinedQuestions: ScreeningQuestion[] = [];
  let currentHistory = [...chatHistory];

  geminiLog.info(`refining ${totalQuestions} questions in batches of ${batchSize}`);

  for (let i = 0; i < totalQuestions; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);
    const prompt = `You are a SENIOR TECHNICAL INTERVIEWER with 15+ years of experience. Your task is to refine interview questions to be STRICTLY DISCIPLINED to the Job Description (JD) and SME Notes.

═══════════════════════════════════════════════════════════════════════════════
📋 JOB DESCRIPTION (PRIMARY SOURCE OF TRUTH)
═══════════════════════════════════════════════════════════════════════════════
${jdText}

${smeNotes ? `═══════════════════════════════════════════════════════════════════════════════
📝 SME NOTES (EXPERT GUIDANCE - MUST INCORPORATE)
═══════════════════════════════════════════════════════════════════════════════
${smeNotes}
` : ""}
═══════════════════════════════════════════════════════════════════════════════
🔧 QUESTIONS TO REFINE (Batch ${Math.floor(i / batchSize) + 1})
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(batch, null, 2)}

${instructions ? `═══════════════════════════════════════════════════════════════════════════════
📌 CUSTOM INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════
${instructions}
` : ""}
═══════════════════════════════════════════════════════════════════════════════
🎯 REFINEMENT DISCIPLINE (STRICT RULES)
═══════════════════════════════════════════════════════════════════════════════

**RULE 1: STRICT JD/SME ALIGNMENT (ZERO TOLERANCE FOR GENERIC QUESTIONS)**
- EVERY question MUST directly reference skills, tools, or responsibilities from the JD
- If SME notes mention specific focus areas, questions MUST address them
- Extract EXACT terminology from JD: technology names, frameworks, tools, methodologies
- Questions that could apply to "any developer" are REJECTED - must be JD-SPECIFIC

**RULE 2: SCENARIO-BASED TRANSFORMATION**
Transform each question into a REAL-WORLD SCENARIO the candidate would face in THIS SPECIFIC ROLE:
- BAD: "How do you handle database optimization?"
- GOOD: "Your [JD-specific-database] queries are timing out during peak traffic. Walk me through your diagnostic and optimization approach."
- BAD: "What's your experience with APIs?"  
- GOOD: "You need to integrate [JD-specific-API/service] with our [JD-mentioned-system]. What's your approach to handling rate limits and failures?"

**RULE 3: COMPLEXITY CALIBRATION**
- Simple (2 min): Direct debugging step, specific tool usage, quick technical decision
- Moderate (2.5 min): Trade-off analysis, approach explanation, problem diagnosis  
- Complex (3 min): Architecture decision, system design, multi-step optimization

**RULE 4: RUBRIC PRECISION**
For each question, rubric signals MUST:
- goodSignals (5 items): Use EXACT JD terminology - tools, frameworks, patterns mentioned
- moderateSignals (5 items): Generic correct answers that lack JD-specific depth
- poorSignals (5 items): Wrong approaches, outdated methods, or JD-misaligned solutions
- typicalReasoning: Reference SPECIFIC technologies from JD (FORBIDDEN: time estimates)
- notes: Follow-up probes using JD-specific terms

**RULE 5: UNIQUENESS ENFORCEMENT**
- Each question tests a DIFFERENT skill/competency area
- NO overlapping topics between questions
- If two questions test similar concepts, MERGE or DIFFERENTIATE them

**RULE 6: FORBIDDEN CONTENT**
❌ Culture-fit questions ("Tell me about yourself")
❌ Behavioral soft-skills ("How do you handle conflict?")
❌ Generic questions that ignore JD specifics
❌ Questions unrelated to JD responsibilities
❌ Time estimates in rubrics ("should answer in X minutes")

═══════════════════════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════
Return EXACTLY ${batch.length} refined questions. Keep same id and competencyId.

{
  "questions": [
    {
      "id": "original_id",
      "competencyId": "original_competencyId", 
      "question": "JD-specific scenario-based question",
      "complexity": "simple|moderate|complex",
      "estimatedMinutes": 2.0|2.5|3.0,
      "rubric": {
        "typicalReasoning": "Expected answer using JD-specific technologies",
        "goodSignals": ["5 JD-specific positive indicators"],
        "moderateSignals": ["5 generic but acceptable indicators"],
        "poorSignals": ["5 problematic/wrong indicators"],
        "notes": "JD-specific follow-up probes"
      },
      "order": original_order,
      "isMandatory": original_value
    }
  ]
}

Only output valid JSON. No markdown code blocks.`;

    try {
      const { text, history: updatedHistory } = await sendMessageWithRetries(prompt, currentHistory);
      currentHistory = updatedHistory;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Failed to find JSON in batch ${i / batchSize + 1}`);
      }

      const parsed = safeJsonParse<any>(jsonMatch[0], `refined questions batch ${i / batchSize + 1}`);
      const refinedBatch = parsed.questions || [];

      for (const refined of refinedBatch) {
        const original = batch.find(q => q.id === refined.id);
        if (original) {
          refinedQuestions.push({
            ...refined,
            id: original.id,
            competencyId: original.competencyId,
            order: original.order,
            isMandatory: original.isMandatory,
          });
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      geminiLog.error(`Refine batch ${i / batchSize + 1} error: ${errMsg}`);
      // If a batch fails, we could potentially continue, but for now we'll throw to be safe
      throw error;
    }
  }

  // Deduplicate refined questions to ensure no repeats
  const beforeDedup = refinedQuestions.length;
  const dedupedQuestions = dedupeByQuestionText(refinedQuestions);
  
  if (dedupedQuestions.length < beforeDedup) {
    geminiLog.info(`Removed ${beforeDedup - dedupedQuestions.length} duplicate questions after refining`);
  }
  
  // Re-order after deduplication
  const finalQuestions = dedupedQuestions.map((q, idx) => ({ ...q, order: idx + 1 }));

  // Validate timeline fit after refining
  if (interviewDuration) {
    validateTimelineFit(finalQuestions, interviewDuration, "After refining questions");
  }

  return { questions: finalQuestions, history: currentHistory };
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
      geminiLog.warn("Cannot generate suggestions: API key not set");
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
      geminiLog.warn("Cannot evaluate answer: API key not set");
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
      geminiLog.error("Failed to parse answer evaluation response");
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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    geminiLog.error(`Answer evaluation error: ${errMsg}`);
    return {
      quality: "moderate",
      score: 3,
      signals: { good: [], moderate: [], poor: [] },
      reasoning: `Evaluation error: ${errMsg}`,
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
      geminiLog.error(`Failed to find JSON in report response. Full response: ${text}`);
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

/**
 * Classify question complexity by analyzing question text patterns.
 * This provides deterministic fallback classification.
 */
function classifyQuestionComplexity(question: string): "simple" | "moderate" | "complex" {
  const text = question.toLowerCase();
  
  // Complex indicators: architecture, design, system-wide, optimization
  const complexKeywords = [
    "design", "architect", "system", "scalable", "optimize", "entire",
    "multiple", "infrastructure", "strategy", "framework", "migration",
    "refactor", "performance tuning", "high traffic", "distributed"
  ];
  
  // Simple indicators: specific tool, debugging, single issue
  const simpleKeywords = [
    "walk me through", "debug", "troubleshoot", "fix", "error",
    "what command", "which tool", "how do you check", "diagnose",
    "step-by-step", "specific", "single"
  ];
  
  const hasComplexKeywords = complexKeywords.some(kw => text.includes(kw));
  const hasSimpleKeywords = simpleKeywords.some(kw => text.includes(kw));
  
  // Question length also indicates complexity
  const wordCount = question.split(/\s+/).length;
  
  if (hasComplexKeywords || wordCount > 30) {
    return "complex";
  } else if (hasSimpleKeywords || wordCount < 20) {
    return "simple";
  } else {
    return "moderate";
  }
}

/**
 * Analyze screening questions and estimate interview time using Gemini AI.
 */
export async function analyzeQuestionTime(
  questions: ScreeningQuestion[],
  competencies: Competency[],
  configuredScreeningTime: number,
  analyzeAll: boolean = false
): Promise<{
  totalEstimatedMinutes: number;
  breakdown: Array<{
    questionId: string;
    questionText: string;
    estimatedMinutes: number;
    reasoning: string;
  }>;
  summary: string;
  recommendation: string;
  withinBudget: boolean;
  includedQuestionIds?: string[];
}> {
  const questionsToAnalyze = analyzeAll ? questions : questions.filter(q => q.isMandatory);
  
  if (questionsToAnalyze.length === 0) {
    return {
      totalEstimatedMinutes: 0,
      breakdown: [],
      summary: "No Q&A screening questions are currently included in the interview.",
      recommendation: "Add planned Q&A questions to get a time estimate.",
      withinBudget: true,
      includedQuestionIds: [],
    };
  }
  
  const includedQuestions = questionsToAnalyze;

  geminiLog.info("Calling Gemini 2.5 Pro (thinking mode) for independent time analysis");
  
  const questionsText = includedQuestions.map((q: any, i) => {
    const comp = competencies.find(c => c.id === q.competencyId);
    return `Question ${i + 1} (id: ${q.id}) [${comp?.name || "General"}]:\n"${q.question}"`;
  }).join("\n\n");

  const prompt = `You are an expert interview time analyst. Your job is to provide ACCURATE, REALISTIC time estimates for screening interview questions.

TASK: Independently analyze each question and estimate how long it will REALISTICALLY take in a live interview setting.

QUESTIONS TO ANALYZE:
${questionsText}

CONFIGURED SCREENING TIME: ${configuredScreeningTime} minutes (this is the Q&A-only time budget)

For EACH question, think carefully about:
1. ASKING TIME: How long it takes the interviewer to read/ask the question clearly (typically 0.3-0.8 min depending on question length)
2. THINKING TIME: How long the candidate needs to recall an experience and formulate their response (typically 0.3-0.5 min for direct questions, 0.5-1.0 min for scenario/behavioral questions)
3. ANSWERING TIME: How long it takes the candidate to deliver a thorough answer:
   - Simple direct-knowledge questions (e.g., "walk through a Dockerfile"): 2-3 min answer
   - Behavioral/STAR-format questions requiring a specific story: 3-5 min answer
   - Complex scenario questions with multiple parts: 4-6 min answer

CRITICAL RULES:
- Do NOT underestimate. It is better to slightly overestimate than to run out of time.
- Multi-part questions (containing "and", "also", "additionally") inherently take longer.
- Questions asking for SPECIFIC EXAMPLES or STORIES (STAR format) require more time for storytelling.
- Questions asking candidates to "describe", "walk through", or "tell me about a time" typically need 4-6 minutes total.
- Simple "how would you" or "what is" questions typically need 2-4 minutes total.

Respond with a JSON object:
{
  "totalEstimatedMinutes": <number - sum of all estimatedMinutes in breakdown>,
  "breakdown": [
    {
      "questionId": "<the exact question id>",
      "questionText": "<first 50 chars of question>...",
      "estimatedMinutes": <number - realistic total estimate>,
      "reasoning": "<breakdown: X min asking + Y min thinking + Z min answering = total>"
    }
  ],
  "summary": "<2-3 sentence summary of the time analysis>",
  "recommendation": "<actionable recommendation based on the ${configuredScreeningTime}-minute budget>",
  "withinBudget": <boolean - true if totalEstimatedMinutes <= ${configuredScreeningTime}>
}

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      geminiLog.warn("API key not set, using fallback estimation");
      throw new Error("API key not set");
    }

    let text: string;
    try {
      geminiLog.info("Using Gemini 2.5 Pro with thinking mode (REST API) for time analysis");
      const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
      const restBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 8192,
          },
        },
      };
      const restResponse = await fetch(restUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(restBody),
      });
      
      if (!restResponse.ok) {
        const errBody = await restResponse.text();
        throw new Error(`REST API error ${restResponse.status}: ${errBody.substring(0, 200)}`);
      }
      
      const restData = await restResponse.json();
      const candidate = restData?.candidates?.[0];
      if (!candidate?.content?.parts?.length) {
        throw new Error("Empty response from Gemini REST API");
      }
      
      const parts = candidate.content.parts;
      const hasThinking = parts.some((p: any) => p.thought === true);
      geminiLog.info(`Gemini response: ${parts.length} parts, thinking=${hasThinking}`);
      
      const nonThoughtParts = parts.filter((p: any) => p.text && p.thought !== true);
      text = nonThoughtParts.map((p: any) => p.text).join("");
      
      if (!text) {
        const allTextParts = parts.filter((p: any) => typeof p.text === "string" && p.text.trim());
        text = allTextParts.length > 0 ? allTextParts[allTextParts.length - 1].text : "";
      }
      
      if (!text || !text.includes("{")) {
        throw new Error(`No valid JSON content in response (got ${text?.length || 0} chars)`);
      }
      
      geminiLog.info(`Gemini 2.5 Pro thinking mode response received (${text.length} chars)`);
    } catch (proError: unknown) {
      const proMsg = proError instanceof Error ? proError.message : String(proError);
      geminiLog.warn(`Gemini 2.5 Pro thinking mode failed (${proMsg}), falling back to standard generation`);
      const fallbackResult = await generateTextWithRetries(prompt);
      text = fallbackResult.text;
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      geminiLog.error("Failed to find JSON in time analysis response");
      throw new Error("Failed to parse AI response");
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "time analysis");

    const breakdown = (parsed.breakdown || []).map((item: any, idx: number) => {
      return {
        questionId: includedQuestions[idx]?.id || item.questionId,
        questionText: item.questionText || includedQuestions[idx]?.question?.substring(0, 60) + "...",
        estimatedMinutes: typeof item.estimatedMinutes === "number" ? Math.round(item.estimatedMinutes * 10) / 10 : 2.5,
        reasoning: item.reasoning || "Standard interview question",
      };
    });

    const totalEstimatedMinutes = breakdown.reduce((sum: number, b: any) => sum + b.estimatedMinutes, 0);
    
    let includedQuestionIds: string[] | undefined;
    if (analyzeAll && configuredScreeningTime > 0) {
      includedQuestionIds = selectQuestionsForBudget(breakdown, configuredScreeningTime, includedQuestions, competencies);
      const includedTotal = breakdown
        .filter((b: any) => includedQuestionIds!.includes(b.questionId))
        .reduce((sum: number, b: any) => sum + b.estimatedMinutes, 0);
      const withinBudget = includedTotal <= configuredScreeningTime;
      geminiLog.info(`AI analysis (analyzeAll): selected ${includedQuestionIds.length}/${breakdown.length} questions, ${includedTotal.toFixed(1)}/${configuredScreeningTime} min`);
      return {
        totalEstimatedMinutes: Math.round(includedTotal * 10) / 10,
        breakdown,
        summary: parsed.summary || generateTimeSummary(includedQuestionIds.length, includedTotal),
        recommendation: parsed.recommendation || generateTimeRecommendation(includedTotal, configuredScreeningTime),
        withinBudget,
        includedQuestionIds,
      };
    }
    
    const withinBudget = totalEstimatedMinutes <= configuredScreeningTime;
    geminiLog.info(`AI time analysis: ${totalEstimatedMinutes.toFixed(1)}/${configuredScreeningTime} min, within budget: ${withinBudget}`);

    return {
      totalEstimatedMinutes: Math.round(totalEstimatedMinutes * 10) / 10,
      breakdown,
      summary: parsed.summary || generateTimeSummary(includedQuestions.length, totalEstimatedMinutes),
      recommendation: parsed.recommendation || generateTimeRecommendation(totalEstimatedMinutes, configuredScreeningTime),
      withinBudget,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    geminiLog.error(`Time analysis error, using fallback: ${errorMessage}`);
    
    const breakdown = includedQuestions.map((q) => {
      const estimatedMinutes = (q as any).estimatedMinutes || 2.5;
      return {
        questionId: q.id,
        questionText: q.question.substring(0, 60) + (q.question.length > 60 ? "..." : ""),
        estimatedMinutes,
        reasoning: (q as any).estimatedMinutes ? "Using estimate from question generation" : "Default estimate (2.5 min per question)",
      };
    });
    
    const totalEstimatedMinutes = breakdown.reduce((sum, b) => sum + b.estimatedMinutes, 0);
    
    let includedQuestionIds: string[] | undefined;
    if (analyzeAll && configuredScreeningTime > 0) {
      includedQuestionIds = selectQuestionsForBudget(breakdown, configuredScreeningTime, includedQuestions, competencies);
      const includedTotal = breakdown
        .filter(b => includedQuestionIds!.includes(b.questionId))
        .reduce((sum, b) => sum + b.estimatedMinutes, 0);
      geminiLog.info(`Fallback analysis (analyzeAll): selected ${includedQuestionIds.length}/${breakdown.length}, ${includedTotal.toFixed(1)}/${configuredScreeningTime} min`);
      return {
        totalEstimatedMinutes: Math.round(includedTotal * 10) / 10,
        breakdown,
        summary: generateTimeSummary(includedQuestionIds.length, includedTotal),
        recommendation: generateTimeRecommendation(includedTotal, configuredScreeningTime),
        withinBudget: includedTotal <= configuredScreeningTime,
        includedQuestionIds,
      };
    }
    
    const withinBudget = totalEstimatedMinutes <= configuredScreeningTime;
    const summary = generateTimeSummary(includedQuestions.length, totalEstimatedMinutes);
    const recommendation = generateTimeRecommendation(totalEstimatedMinutes, configuredScreeningTime);
    
    geminiLog.info(`Fallback time analysis: ${totalEstimatedMinutes.toFixed(1)}/${configuredScreeningTime} min`);
    
    return {
      totalEstimatedMinutes: Math.round(totalEstimatedMinutes * 10) / 10,
      breakdown,
      summary,
      recommendation,
      withinBudget,
    };
  }
}

function selectQuestionsForBudget(
  breakdown: Array<{ questionId: string; estimatedMinutes: number }>,
  budgetMinutes: number,
  questions: ScreeningQuestion[],
  competencies: Competency[]
): string[] {
  const selected: string[] = [];
  let usedTime = 0;
  
  const competencyIds = Array.from(new Set(questions.map(q => q.competencyId)));
  const coveredCompetencies = new Set<string>();
  
  for (const compId of competencyIds) {
    const compQuestions = breakdown.filter(b => {
      const q = questions.find(q => q.id === b.questionId);
      return q?.competencyId === compId;
    }).sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    
    if (compQuestions.length > 0) {
      const best = compQuestions[0];
      if (usedTime + best.estimatedMinutes <= budgetMinutes) {
        selected.push(best.questionId);
        usedTime += best.estimatedMinutes;
        coveredCompetencies.add(compId);
      }
    }
  }
  
  const remaining = breakdown
    .filter(b => !selected.includes(b.questionId))
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
  
  for (const item of remaining) {
    if (usedTime + item.estimatedMinutes <= budgetMinutes) {
      selected.push(item.questionId);
      usedTime += item.estimatedMinutes;
    }
  }
  
  return selected;
}