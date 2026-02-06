import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Competency, ScreeningQuestion, InterviewReport, TranscriptEntry, AISuggestion, InterviewNotes, AnswerEvaluation, AIChatMessage } from "@shared/schema";
import { getTargetQuestionCountForScreening, getBandForScreening, getExcludedCountForScreening } from "@shared/schema";

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
 * Time estimates per question complexity (in minutes).
 * Used only for backward compatibility (e.g. analyzeQuestionTime). Prefer model-provided estimatedMinutes.
 */
const TIME_ESTIMATES = {
  simple: 2.0,
  moderate: 2.5,
  complex: 3.0,
} as const;

/** Single default when model does not provide estimatedMinutes (no hardcoded per-complexity in flow). */
const DEFAULT_ESTIMATED_MINUTES = 2.5;

/** Minutes reserved for introductions, transitions, and candidate questions; Q&A content must fit within screening minus this. */
const SCREENING_BUFFER_MINUTES = 5;

/** Excluded count is per-band (see getExcludedCountForScreening); no single constant. */

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
 * Calculate total minutes from complexity counts using TIME_ESTIMATES
 */
function calculateTotalMinutes(counts: ComplexityCounts): number {
  return (counts.simple * TIME_ESTIMATES.simple) +
         (counts.moderate * TIME_ESTIMATES.moderate) +
         (counts.complex * TIME_ESTIMATES.complex);
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
function generateTimeSummary(counts: ComplexityCounts, totalMinutes: number): string {
  return `The screening consists of ${counts.simple} simple, ${counts.moderate} moderate, and ${counts.complex} complex questions, totaling ${totalMinutes.toFixed(1)} minutes of pure Q&A time. This calculation strictly covers the question-and-answer period and excludes introductions, follow-up probes, or closing remarks.`;
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
  // Question generation expects Gemini 3 preview; set GEMINI_MODEL=gemini-3-flash-preview in .env
  const preferred = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const fallbacks = ["gemini-2.0-flash-thinking-exp-01-21", "gemini-2.0-flash-thinking-exp", "gemini-exp-1206"];
  return [preferred, ...fallbacks].filter((v, i, a) => a.indexOf(v) === i);
}

/** Model candidates for time analysis: prefer Gemini 3 Pro (thinking/reasoning). */
function getTimeAnalysisModelCandidates() {
  const preferred = process.env.GEMINI_TIME_ANALYSIS_MODEL || "gemini-3-pro-preview";
  const fallbacks = ["gemini-2.0-flash-thinking-exp-01-21", "gemini-2.0-flash-thinking-exp", "gemini-3-flash-preview"];
  return [preferred, ...fallbacks].filter((v, i, a) => a.indexOf(v) === i);
}

async function generateTextWithRetries(prompt: string, options?: { modelCandidates?: string[] }) {
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
  }

  const models = options?.modelCandidates ?? getGeminiModelCandidates();
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

    // Validate and preserve complexity from AI response
    let complexity = q.complexity || "moderate";
    if (!["simple", "moderate", "complex"].includes(complexity)) {
      complexity = "moderate";
    }
    const estimatedMinutes = typeof q.estimatedMinutes === "number" && q.estimatedMinutes > 0 ? q.estimatedMinutes : DEFAULT_ESTIMATED_MINUTES;

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
 * Target total question count (mandatory + buffer) from screening time bands.
 * Uses explicit bands: <20 → 6, 20–25 → 8, 25–30 → 10, 30–35 → 11, etc.
 */
function calculateMaxQuestions(interviewDuration?: number): number {
  const screening = typeof interviewDuration === "number" && !Number.isNaN(interviewDuration) && interviewDuration > 0
    ? interviewDuration
    : 15;
  const count = getTargetQuestionCountForScreening(screening);
  geminiLog.info(`Screening ${screening} min → target ${count} questions total (from bands)`);
  return count;
}

/**
 * No hardcoded buffer count; prompt asks for "some additional optional questions" only.
 */
function calculateBufferQuestions(_mainQuestions: number): number {
  return 0;
}

function autoCorrectComplexity(question: { question?: string; complexity?: string }): { 
  complexity: "simple" | "moderate" | "complex"; 
  estimatedMinutes: number; 
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
    estimatedMinutes: DEFAULT_ESTIMATED_MINUTES,
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

/**
 * Validate and log timeline fit for questions
 * Uses AI-assigned complexity from questions
 */
function validateTimelineFit(
  questions: ScreeningQuestion[],
  interviewDuration: number,
  context: string
): void {
  const mandatory = questions.filter(q => q.isMandatory !== false);
  const counts = countByComplexity(mandatory as Array<{ complexity?: string }>);
  const estimatedTime = calculateTotalMinutes(counts);
  
  geminiLog.info(`${context}: ${mandatory.length} Q&A questions (${counts.simple}S, ${counts.moderate}M, ${counts.complex}C), estimated ${estimatedTime.toFixed(1)} min (Q&A budget: ${interviewDuration} min, excludes intro/follow-ups)`);
  
  if (estimatedTime > interviewDuration) {
    geminiLog.warn(`${context}: Exceeds Q&A time budget by ${(estimatedTime - interviewDuration).toFixed(1)} min`);
  } else {
    geminiLog.success(`${context}: Within Q&A time budget (${(interviewDuration - estimatedTime).toFixed(1)} min remaining)`);
  }
}

/**
 * Validate that questions meet the target complexity distribution.
 * Uses AI-assigned complexity from questions, adjusts if over time budget.
 */
function validateComplexityDistribution(
  questions: ScreeningQuestion[],
  maxQuestions: number,
  screeningTime: number
) {
  const mandatory = questions.filter(q => q.isMandatory !== false);
  
  // Use AI-assigned complexity (already validated and set)
  type ClassifiedQuestion = ScreeningQuestion & { estimatedTime: number };
  const classified: ClassifiedQuestion[] = mandatory.map((q) => {
    const complexity = (q as { complexity?: string }).complexity || "moderate";
    const validComplexity = ["simple", "moderate", "complex"].includes(complexity) 
      ? complexity as keyof typeof TIME_ESTIMATES 
      : "moderate";
    return {
      ...q,
      complexity: validComplexity,
      estimatedTime: TIME_ESTIMATES[validComplexity],
    } as ClassifiedQuestion;
  });
  
  // Count by complexity using utility function
  const counts = countByComplexity(classified as Array<{ complexity?: string }>);
  
  // Use adaptive distribution based on screening time
  const target = getAdaptiveComplexityDistribution(screeningTime, maxQuestions);
  
  const totalTime = calculateTotalMinutes(counts);
  
  geminiLog.info(`AI complexity distribution: ${counts.simple}S/${target.simple}, ${counts.moderate}M/${target.moderate}, ${counts.complex}C/${target.complex}`);
  geminiLog.info(`Total Q&A time: ${totalTime.toFixed(1)}/${screeningTime} min (excludes intro/follow-ups)`);
  
  if (totalTime <= screeningTime && classified.length <= maxQuestions) {
    geminiLog.success(`Q&A questions fit within time budget`);
    return classified;
  }
  
  // If over budget, remove questions starting with complex ones
  geminiLog.warn(`Adjusting Q&A questions to fit time budget`);
  let adjusted = [...classified];
  const adjustedCounts = { ...counts };
  
  while (calculateTotalMinutes(countByComplexity(adjusted as Array<{ complexity?: string }>)) > screeningTime || adjusted.length > maxQuestions) {
    // Remove in order: complex first, then moderate, then simple
    const complexIdx = adjusted.findIndex(q => (q as { complexity?: string }).complexity === "complex");
    const moderateIdx = adjusted.findIndex(q => (q as { complexity?: string }).complexity === "moderate");
    
    if (complexIdx !== -1 && adjustedCounts.complex > target.complex) {
      adjusted.splice(complexIdx, 1);
      adjustedCounts.complex--;
    } else if (moderateIdx !== -1 && adjustedCounts.moderate > target.moderate) {
      adjusted.splice(moderateIdx, 1);
      adjustedCounts.moderate--;
    } else if (adjusted.length > 0) {
      adjusted.pop(); // Remove last question
    } else {
      break;
    }
  }
  
  const finalCounts = countByComplexity(adjusted as Array<{ complexity?: string }>);
  const finalTime = calculateTotalMinutes(finalCounts);
  geminiLog.info(`Adjusted to ${adjusted.length} Q&A questions, ${finalTime.toFixed(1)} min Q&A time`);
  
  return adjusted;
}

/** Use model-provided estimatedMinutes when present; otherwise default. */
function getQuestionMinutes(q: ScreeningQuestion): number {
  return typeof q.estimatedMinutes === "number" && q.estimatedMinutes > 0 ? q.estimatedMinutes : DEFAULT_ESTIMATED_MINUTES;
}

/**
 * Ask Gemini to perform a proper time analysis of each question and decide which ones
 * to INCLUDE so the total estimated time matches (fits within) the screening time.
 *
 * Gemini estimates per-question time (interviewer ask + candidate think/respond) and
 * selects the best subset whose total ≤ contentBudget.
 *
 * Returns { includedIds, breakdown } or null on failure (caller falls back to local trim).
 */
async function analyzeAndSelectIncludedQuestions(
  questions: ScreeningQuestion[],
  screeningTime: number,
  contentBudget: number
): Promise<{
  includedIds: string[];
  breakdown: Array<{ questionId: string; estimatedMinutes: number; included: boolean; reasoning: string }>;
  totalIncludedMinutes: number;
} | null> {
  if (questions.length === 0 || !apiKey) return null;

  const questionsText = questions.map((q, i) =>
    `${i + 1}. [id: ${q.id}] ${q.question}`
  ).join("\n");

  const prompt = `You are an expert interview consultant analyzing screening questions for a technical interview.

TASK: Estimate the time needed for each question and provide an analysis.

QUESTIONS TO ANALYZE:
${questionsText}

CONFIGURED SCREENING TIME: ${contentBudget} minutes

For each question, estimate in minutes:
- How long it will take for the interviewer to ask the question
- How long it will take for the candidate to think and respond

Based on your time estimates, decide which questions to INCLUDE so that the total estimatedMinutes of included questions fits within ${contentBudget} minutes. Mark each question as "included": true or false. Maximize included questions while staying within budget.

Respond with a JSON object:
{
  "totalEstimatedMinutes": <number - sum of estimatedMinutes for INCLUDED questions only>,
  "breakdown": [
    {
      "questionId": "<question_id>",
      "questionText": "<first 50 chars of question>...",
      "estimatedMinutes": <number>,
      "included": true | false,
      "reasoning": "<brief explanation>"
    }
  ],
  "summary": "<2-3 sentence summary of the time analysis>",
  "recommendation": "<actionable recommendation based on time budget>",
  "withinBudget": <boolean - true if total <= configured time>
}

Only output valid JSON. No markdown code blocks.`;

  try {
    const { text } = await generateTextWithRetries(prompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      geminiLog.warn("analyzeAndSelectIncludedQuestions: no JSON in response");
      return null;
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "time-based inclusion analysis");
    const breakdown: Array<{ questionId: string; estimatedMinutes: number; included: boolean; reasoning: string }> = [];
    const validIds = new Set(questions.map((q) => q.id));

    for (const item of (parsed.breakdown || [])) {
      if (!item.questionId || !validIds.has(item.questionId)) continue;
      const mins = Number(item.estimatedMinutes);
      breakdown.push({
        questionId: item.questionId,
        estimatedMinutes: Number.isFinite(mins) && mins > 0 ? mins : DEFAULT_ESTIMATED_MINUTES,
        included: !!item.included,
        reasoning: item.reasoning || "",
      });
    }

    // Validate: re-check total included ≤ contentBudget; if Gemini over-included, trim from the end
    let totalIncluded = 0;
    const includedIds: string[] = [];
    for (const b of breakdown) {
      if (b.included) {
        if (totalIncluded + b.estimatedMinutes <= contentBudget) {
          includedIds.push(b.questionId);
          totalIncluded += b.estimatedMinutes;
        } else {
          b.included = false; // exceeded budget, force exclude
          geminiLog.warn(`Excluding "${b.questionId}" (${b.estimatedMinutes} min) — would exceed content budget ${contentBudget} min`);
        }
      }
    }

    // Also update estimatedMinutes on original questions from Gemini's analysis
    const minutesMap = new Map(breakdown.map((b) => [b.questionId, b.estimatedMinutes]));
    for (const q of questions) {
      const geminiMinutes = minutesMap.get(q.id);
      if (geminiMinutes != null) {
        (q as any).estimatedMinutes = geminiMinutes;
      }
    }

    geminiLog.info(`Gemini time analysis: ${includedIds.length} included (${totalIncluded.toFixed(1)} min ≤ ${contentBudget} min), ${questions.length - includedIds.length} excluded`);
    if (parsed.summary) geminiLog.info(`Gemini summary: ${parsed.summary}`);
    if (parsed.recommendation) geminiLog.info(`Gemini recommendation: ${parsed.recommendation}`);

    return { includedIds, breakdown, totalIncludedMinutes: totalIncluded };
  } catch (e) {
    geminiLog.warn("analyzeAndSelectIncludedQuestions failed, falling back to local trim", e);
    return null;
  }
}

function enforceTimeBudget(
  questions: ScreeningQuestion[],
  interviewDuration?: number,
  options?: { useGeminiInclusion?: boolean }
): ScreeningQuestion[] {
  const screeningTime = interviewDuration || 15;
  const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);
  const mandatory = questions.filter(q => q.isMandatory !== false);
  const buffer = questions.filter(q => q.isMandatory === false);

  let sum = mandatory.reduce((s, q) => s + getQuestionMinutes(q), 0);
  let trimmedMandatory = [...mandatory];
  while (sum > contentBudget && trimmedMandatory.length > 1) {
    const last = trimmedMandatory.pop()!;
    sum -= getQuestionMinutes(last);
  }
  if (trimmedMandatory.length < mandatory.length) {
    geminiLog.info(`Trimmed ${mandatory.length - trimmedMandatory.length} question(s) to fit content budget ${contentBudget} min (screening ${screeningTime} min, sum ${sum.toFixed(1)} min)`);
  }

  const excludedCount = getExcludedCountForScreening(screeningTime);
  const useGeminiInclusion = options?.useGeminiInclusion === true;

  let combined: ScreeningQuestion[];
  if (useGeminiInclusion) {
    // Respect Gemini inclusion: included = trimmed mandatory, excluded = rest (no forced excludedCount).
    const trimmedIds = new Set(trimmedMandatory.map((q) => q.id));
    const rest = questions.filter((q) => !trimmedIds.has(q.id));
    combined = [...trimmedMandatory, ...rest].map((q, idx) => ({
      ...q,
      order: idx + 1,
      isMandatory: idx < trimmedMandatory.length,
    }));
  } else {
    combined = [...trimmedMandatory, ...buffer].map((q, idx) => ({ ...q, order: idx + 1 }));
    if (combined.length >= excludedCount) {
      combined = combined
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((q, idx) => ({
          ...q,
          order: idx + 1,
          isMandatory: idx < combined.length - excludedCount,
        }));
    }
  }

  const mainCount = combined.filter((q) => q.isMandatory !== false).length;
  const excludedCountActual = combined.length - mainCount;
  geminiLog.info(`Final after time budget: ${mainCount} main + ${excludedCountActual} excluded = ${combined.length} total`);
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
  totalInterviewMinutes?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  geminiLog.info(`extractCompetenciesAndQuestions called with Q&A duration (excludes intro/follow-ups): ${interviewDuration} min, total interview: ${totalInterviewMinutes ?? "not set"} min`);

  const screeningTime = interviewDuration || 15;
  const band = getBandForScreening(screeningTime);
  const totalQuestions = band.questionCount;
  const maxQuestions = band.includedCount;
  const bufferQuestions = band.excludedCount;
  
  // Check if we need batched generation to avoid token limits
  if (totalQuestions > MAX_QUESTIONS_PER_BATCH) {
    geminiLog.info(`Large question count (${totalQuestions}), using batched generation to avoid token limits`);
    return extractCompetenciesAndQuestionsBatched(
      jdText, smeNotes, customInstructions, companyWebsite, location, 
      interviewDuration, existingQuestions, chatHistory, totalInterviewMinutes
    );
  }
  
  geminiLog.info(`Will generate up to ${totalQuestions} questions (${maxQuestions} included + ${bufferQuestions} excluded) for ${screeningTime} min screening time; total interview ${totalInterviewMinutes ?? "not set"} min`);

  const existingQuestionTexts = (existingQuestions || [])
    .map((q) => q?.question)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  const existingQuestionKeys = new Set(existingQuestionTexts.map(normalizeQuestionKey).filter(Boolean));

  const existingQuestionsSection = existingQuestions && existingQuestions.length > 0
    ? `\n\nEXISTING QUESTIONS (DO NOT DUPLICATE THESE):\n${existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n`
    : '';

  const totalTimeLine = totalInterviewMinutes != null && totalInterviewMinutes > 0
    ? `\nTotal interview time for this slot is ${totalInterviewMinutes} minutes. Do not exceed the screening time and keep the overall flow within total interview time.\n`
    : '';
  const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);

  const prompt = `You are a subject matter expert in the role that is being hired. Review the JD below for context. In addition, the role is being hired in ${location || "the location specified by the user"}.

JOB DESCRIPTION:
${jdText || "No JD provided."}

Here are notes from the Subject Matter Expert for more context:
${smeNotes || "No SME notes provided."}
${customInstructions ? `\nAdditional custom instructions:\n${customInstructions}\n` : ''}
${companyWebsite ? `Company website: ${companyWebsite}\n` : ''}
${totalTimeLine}

Screening slot is ${screeningTime} minutes. Reserve ${SCREENING_BUFFER_MINUTES} minutes for introductions, transitions, and candidate questions. **Content budget for Q&A: ${contentBudget} minutes.** Generate ${totalQuestions} questions total: exactly ${maxQuestions} mandatory (isMandatory: true) and exactly ${bufferQuestions} additional/excluded (isMandatory: false). The sum of estimatedMinutes for mandatory questions MUST NOT exceed ${contentBudget} minutes. Set estimatedMinutes for each question; ensure the total fits.

According to all of this, create questions with expected answers and a screening criteria (Good-fit answer, moderate-fit answer, bad-fit answer) that will be easy for the hiring manager to ask and also conclude if the candidate is a good-fit. Questions can be scenario-based or ask about a skill directly. Exactly ${bufferQuestions} questions must be additional (use "isMandatory": false); the rest are mandatory (isMandatory: true).

The objective is so that the hiring manager can save time of the subject matter expert employees by reducing candidates that are clearly not a good-fit and ones that just answer buzzwords and lack needed experience/knowledge.

STRICT: Total estimatedMinutes for isMandatory: true questions must be ≤ ${contentBudget}. Exactly ${bufferQuestions} questions must be isMandatory: false (excluded). Total: ${totalQuestions} questions.

Produce this in a JSON Format.

Requirements:
1. Extract 3-5 key competencies from the JD.
2. Generate ${totalQuestions} questions total: ${maxQuestions} mandatory (isMandatory: true) and exactly ${bufferQuestions} additional (isMandatory: false). For each question include estimatedMinutes (number) and a rubric with: typicalReasoning (brief expected reasoning), goodSignals (Good-fit answer criteria), moderateSignals (moderate-fit answer criteria), poorSignals (bad-fit answer criteria), and notes.
3. First ${maxQuestions} questions (total estimatedMinutes ≤ ${contentBudget}): "isMandatory": true. Last ${bufferQuestions} questions: "isMandatory": false.
4. Use EXACT terms from the JD in questions and rubrics. Focus on practical experience and filter out buzzword-only candidates.

Respond with a JSON object in this exact format. Include estimatedMinutes for each question so the sum of mandatory questions fits within ${contentBudget} minutes.


   
5. **GROUND EVERY QUESTION IN THE JD/SME NOTES WITH STRONG SCENARIOS:**
   - Use SPECIFIC technologies mentioned (e.g., "Docker", "Kubernetes", "React", "PostgreSQL")
   - Reference ACTUAL responsibilities from the JD (e.g., "optimize database queries", "design microservices")
   - Address challenges mentioned in SME notes with problem-solving scenarios
   
   **QUESTION STRENGTH EXAMPLES:**
   - **WEAK (generic)**: "How do you handle errors in APIs?"
   - **BETTER (JD-specific)**: "How would you handle rate-limiting errors when calling the Stripe API?" (if Stripe is in JD)
   - **STRONGEST (JD-specific + scenario)**: "Your app is getting 429 rate-limit errors from the Stripe API during peak hours. Walk me through your troubleshooting and solution approach." (if Stripe is in JD)

6. ABSOLUTELY NO CULTURE-FIT OR SOFT-SKILLS QUESTIONS. Do not ask about personality, teamwork (unless technical collaboration like Git workflow), or "where they see themselves." Focus exclusively on the hard skills, domain knowledge, and operational proficiency EXPLICITLY required by the JD and SME notes.

7. NO REVERSE QUESTIONS: Do not generate questions that ask the candidate if they have questions for the interviewer (e.g., "What questions do you have for me?"). Every question must be a technical or scenario-based evaluation of the candidate.

8. UNIQUE AND NON-REPETITIVE: Every question in this set MUST be completely unique from the others. Do not repeat the same concept across different questions.   
   **⚠️ FORBIDDEN IN typicalReasoning:**
   - DO NOT mention time estimates (e.g., "should take 2 minutes", "under 2 minutes")
   - DO NOT mention how long the answer should take
   - DO NOT include phrases like "answered in X minutes" or "within X minutes"
   - ONLY focus on what demonstrates REAL experience and competence
   
   - **goodSignals** (STRONG/EXPERT Answer Indicators): Exactly 5 highly specific, detailed points that prove HANDS-ON EXPERIENCE and DEEP UNDERSTANDING. Each signal must show the candidate has actually DONE this, not just read about it. Reference SPECIFIC technologies from the JD and look for:
     - Step-by-step troubleshooting approaches (shows real debugging experience)
     - Specific tool commands, configuration, or code patterns (proves hands-on usage)
     - Trade-off awareness and production considerations (demonstrates seniority)
     - Concrete examples or metrics (shows real-world application)
     Example: "BEST: Describes checking slow query logs using pg_stat_statements, then explains using EXPLAIN ANALYZE to identify missing indexes, and mentions creating partial indexes for common WHERE clauses" (if PostgreSQL in JD)
   
   - **moderateSignals** (AVERAGE/MID-LEVEL Answer Indicators): Exactly 5 points showing technically correct but SURFACE-LEVEL knowledge. These candidates know the concepts but lack depth or practical experience:
     - Mentions general approaches without specific tools/commands
     - Correct but generic answers (not JD-specific)
     - Lacks production/scaling considerations
     Example: "MODERATE: Says they would 'check for slow queries and add indexes' but doesn't mention specific PostgreSQL tools or techniques"
   
   - **poorSignals** (WEAK/RED FLAG Indicators): Exactly 5 clear red flags that expose LACK OF REAL EXPERIENCE:
     - Fundamentally incorrect understanding
     - Suggests approaches that contradict the JD tech stack
     - Cannot explain HOW they would do something (theory only)
     - Generic buzzword answers with no specifics
     - Dangerous or anti-pattern approaches
     Example: "RED FLAG: Suggests adding indexes to all columns without considering trade-offs, or cannot explain how to identify which queries are slow"
   
   - **notes**: Specific domain-specific probing questions for the HR person to use if the initial answer is vague.

CRITICAL: You are acting as a world-class Subject Matter Expert designing a RIGOROUS SCREENING PROCESS for THIS SPECIFIC ROLE. 

**YOUR MISSION**: Create questions that FILTER OUT weak candidates and IDENTIFY strong, experienced candidates who have real hands-on experience with the technologies in the JD.

**JD/SME ALIGNMENT REQUIREMENTS:**
- Every question MUST tie directly to a requirement, technology, or responsibility in the JD
- Use EXACT tool/framework names mentioned in the JD (e.g., "React", "PostgreSQL", "AWS Lambda")
- Reference SPECIFIC challenges or priorities from the SME notes
- Frame questions as REAL PROBLEMS the candidate will face in this role
- Questions should expose candidates who only know buzzwords vs those with real experience
- Rubrics must include the ACTUAL technical terms from the JD so interviewers can match candidate responses
- Avoid generic questions that could apply to any role in this field

**STRENGTH & FILTERING REQUIREMENTS:**
- Questions must DIFFERENTIATE between junior/mid/senior level candidates
- Focus on PRACTICAL PROBLEM-SOLVING, not memorized definitions
- Include TRADE-OFFS, DEBUGGING, and PRODUCTION scenarios
- Strong candidates should provide SPECIFIC STEPS, TOOLS, and EXPERIENCES
- Weak candidates should be exposed when they give vague, generic answers

**RUBRIC PRECISION:**
The rubrics must be RIGOROUS and so precise that an interviewer with NO domain knowledge can accurately distinguish between:
- **STRONG candidates**: Give step-by-step approaches, mention specific tools/commands, show trade-off awareness
- **AVERAGE candidates**: Know the concepts but lack depth or practical experience
- **WEAK candidates**: Use buzzwords without specifics, cannot explain HOW, or suggest wrong approaches

Avoid generic filler. Direct matches to technical concepts from the JD are mandatory. Each rubric signal should clearly identify what separates strong from weak answers.


**RUBRICS:** Exact JD terminology; goodSignals (Good-fit), moderateSignals (moderate-fit), poorSignals (bad-fit).

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
      "question": "How do you check why a FastAPI endpoint is returning 500 errors?",
      "complexity": "simple",
      "estimatedMinutes": 2.0,
      "rubric": {
        "typicalReasoning": "This question tests whether the candidate has real production experience with FastAPI error handling, not just theoretical knowledge. Strong candidates will demonstrate hands-on experience by describing specific FastAPI features (HTTPException, custom exception handlers), concrete logging setup (Python's logging module with proper levels), and production best practices (never exposing stack traces to users). This separates candidates who have actually debugged production FastAPI apps from those who only know the basics.",
        "goodSignals": [
          "BEST: Describes setting up a custom exception handler using @app.exception_handler() decorator to centralize error handling, showing hands-on FastAPI experience.",
          "BEST: Explains configuring Python's logging module with different log levels (ERROR for exceptions, INFO for normal flow) and mentions sending logs to a service like CloudWatch or Sentry for production monitoring.",
          "BEST: Mentions using HTTPException for client errors (400-499) vs regular exceptions for server errors (500), and explains returning Pydantic models for consistent error responses.",
          "BEST: Describes specific debugging steps: checking FastAPI's automatic validation errors, adding structured logging with request_id for tracing, and using middleware to capture all unhandled exceptions.",
          "BEST: Explains the trade-off between detailed error messages for debugging vs sanitized messages for users, and mentions environment-based configuration (detailed in dev, sanitized in prod)."
        ],
        "moderateSignals": [
          "MODERATE: Mentions using try/except blocks and HTTPException but doesn't explain a centralized error handling strategy or production logging setup.",
          "MODERATE: Says they would 'add logging' but doesn't specify which Python logging library, log levels, or where logs would be sent in production.",
          "MODERATE: Knows about returning JSON errors but doesn't mention Pydantic models or consistent error response schemas.",
          "MODERATE: Describes error handling generally but doesn't reference FastAPI-specific features like exception handlers or automatic Pydantic validation.",
          "MODERATE: Mentions separating dev and prod error messages but doesn't explain HOW this would be implemented (environment variables, config, etc.)."
        ],
        "poorSignals": [
          "RED FLAG: Suggests catching all exceptions with 'except Exception: pass' or returning generic error messages without proper logging, which makes debugging impossible.",
          "RED FLAG: Proposes using print() statements instead of proper logging, showing lack of production experience.",
          "RED FLAG: Cannot explain the difference between 4xx (client errors) and 5xx (server errors) status codes or when to use each.",
          "RED FLAG: Suggests exposing full Python stack traces to users in production, which is a security risk and provides no value to end users.",
          "RED FLAG: Confuses FastAPI error handling with other frameworks (like Django or Flask) or cannot name any FastAPI-specific error handling features."
        ],
        "notes": "Ask: 'How do you distinguish between an error caused by invalid input versus a database failure?'"
      },
      "isMandatory": true,
      "order": 1
    }
  ],
  "timeAnalysis": {
    "totalMinutes": 14.5,
    "breakdown": {
      "simple": 2,
      "moderate": 3,
      "complex": 1
    },
    "withinBudget": true,
    "summary": "6 questions: 2 simple (4.0 min) + 3 moderate (7.5 min) + 1 complex (3.0 min) = 14.5 min"
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
        // Complexity and estimatedMinutes are optional (model may omit when Gemini decides question mix)
        let complexity = q.complexity || "moderate";
        if (!["simple", "moderate", "complex"].includes(complexity)) {
          complexity = "moderate";
        }
        let estimatedMinutes = q.estimatedMinutes;
        if (estimatedMinutes == null || typeof estimatedMinutes !== "number") {
          estimatedMinutes = DEFAULT_ESTIMATED_MINUTES;
        }
        // Optionally auto-correct complexity only when model provided it
        const corrected = q.complexity ? autoCorrectComplexity({ ...q, complexity }) : { complexity, estimatedMinutes, corrected: false };
        
        return {
          id: q.id || `q_${generateId()}`,
          competencyId: q.competencyId,
          question: q.question,
          complexity: corrected.complexity,
          estimatedMinutes: corrected.estimatedMinutes ?? estimatedMinutes,
          rubric: q.rubric || { typicalReasoning: "", goodSignals: [], moderateSignals: [], poorSignals: [], notes: "" },
          isMandatory: q.isMandatory ?? true,
          order: q.order || idx + 1,
        };
      });
      
      // Extract AI's time analysis if provided
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

    // Log the initial count from AI
    const mandatoryQuestions = questions.filter(q => q.isMandatory !== false);
    const bufferQuestionsGenerated = questions.filter(q => q.isMandatory === false);
    
    geminiLog.info(`AI generated ${questions.length} total questions (target: ${totalQuestions})`);
    geminiLog.info(`- Main questions: ${mandatoryQuestions.length} (target: ${maxQuestions})`);
    geminiLog.info(`- Buffer questions: ${bufferQuestionsGenerated.length} (target: ${bufferQuestions})`);
    
    // Use complexity from AI response (already validated in parseResponse)
    const complexityCounts = {
      simple: mandatoryQuestions.filter((q: ScreeningQuestion) => q.complexity === "simple").length,
      moderate: mandatoryQuestions.filter((q: ScreeningQuestion) => q.complexity === "moderate").length,
      complex: mandatoryQuestions.filter((q: ScreeningQuestion) => q.complexity === "complex").length,
    };
    
    // Calculate time from AI-assigned complexity
    const actualTime = (complexityCounts.simple * TIME_ESTIMATES.simple) +
                       (complexityCounts.moderate * TIME_ESTIMATES.moderate) +
                       (complexityCounts.complex * TIME_ESTIMATES.complex);
    
    geminiLog.info(`AI-assigned complexity: ${complexityCounts.simple} simple, ${complexityCounts.moderate} moderate, ${complexityCounts.complex} complex`);
    geminiLog.info(`Calculated Q&A time: (${complexityCounts.simple}×2.0) + (${complexityCounts.moderate}×2.5) + (${complexityCounts.complex}×3.0) = ${actualTime.toFixed(1)} min`);
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

    // Reorder, then ask Gemini to do proper time analysis and select which questions fit in screening time
    questions = questions.map((q, idx) => ({ ...q, order: idx + 1 }));
    let inclusionResult: { includedIds: string[] } | null = null;
    {
      const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);
      const analysisResult = await analyzeAndSelectIncludedQuestions(questions, screeningTime, contentBudget);
      if (analysisResult) {
        inclusionResult = { includedIds: analysisResult.includedIds };
        const includedSet = new Set(analysisResult.includedIds);
        questions = questions.map((q) => ({ ...q, isMandatory: includedSet.has(q.id) }));
      }
    }
    questions = enforceTimeBudget(questions, interviewDuration, { useGeminiInclusion: !!inclusionResult });

    const finalMandatory = questions.filter(q => q.isMandatory !== false);
    const finalBuffer = questions.filter(q => q.isMandatory === false);
    
    geminiLog.info(`Final question count after all processing: ${questions.length} total (${finalMandatory.length} main + ${finalBuffer.length} buffer)`);
    geminiLog.info(`Target was: ${totalQuestions} total (${maxQuestions} main + ${bufferQuestions} buffer)`);
    
    // Calculate final time estimate based on AI-assigned complexity
    const finalComplexityCounts = {
      simple: finalMandatory.filter((q: ScreeningQuestion) => q.complexity === "simple").length,
      moderate: finalMandatory.filter((q: ScreeningQuestion) => q.complexity === "moderate").length,
      complex: finalMandatory.filter((q: ScreeningQuestion) => q.complexity === "complex").length,
    };
    
    const finalEstimatedTime = (finalComplexityCounts.simple * TIME_ESTIMATES.simple) +
                               (finalComplexityCounts.moderate * TIME_ESTIMATES.moderate) +
                               (finalComplexityCounts.complex * TIME_ESTIMATES.complex);
    
    geminiLog.info(`Final AI-assigned complexity: ${finalComplexityCounts.simple}S + ${finalComplexityCounts.moderate}M + ${finalComplexityCounts.complex}C`);
    
    if (finalMandatory.length !== maxQuestions) {
      geminiLog.warn(`WARNING: Main question count (${finalMandatory.length}) does not match target (${maxQuestions})`);
    }
    if (finalBuffer.length !== bufferQuestions) {
      geminiLog.warn(`INFO: Buffer question count (${finalBuffer.length}) differs from target (${bufferQuestions})`);
    }
    if (finalEstimatedTime > screeningTime) {
      geminiLog.warn(`WARNING: Q&A time (${finalEstimatedTime.toFixed(1)} min) exceeds screening budget (${screeningTime} min Q&A only, excludes intro/follow-ups)`);
      geminiLog.warn(`Breakdown: (${finalComplexityCounts.simple} × 2.0) + (${finalComplexityCounts.moderate} × 2.5) + (${finalComplexityCounts.complex} × 3.0) = ${finalEstimatedTime.toFixed(1)} min`);
    } else {
      geminiLog.success(`Q&A time budget validated: ${finalEstimatedTime.toFixed(1)} min / ${screeningTime} min Q&A budget (excludes intro/follow-ups)`);
      geminiLog.info(`Breakdown: (${finalComplexityCounts.simple} × 2.0) + (${finalComplexityCounts.moderate} × 2.5) + (${finalComplexityCounts.complex} × 3.0) = ${finalEstimatedTime.toFixed(1)} min`);
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
  totalInterviewMinutes?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[]; history: AIChatMessage[] }> {
  const screeningTime = interviewDuration || 15;
  const band = getBandForScreening(screeningTime);
  const totalQuestions = band.questionCount;
  const maxQuestions = band.includedCount;
  const bufferQuestions = band.excludedCount;
  
  geminiLog.info(`Batched generation: ${totalQuestions} questions (${maxQuestions} included + ${bufferQuestions} excluded) in batches of ${MAX_QUESTIONS_PER_BATCH}`);
  
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
      ? buildFirstBatchPrompt(jdText, smeNotes, customInstructions, companyWebsite, location, questionsNeeded, screeningTime, existingQuestions, totalInterviewMinutes)
      : buildSubsequentBatchPrompt(jdText, competencies, questionsNeeded, allQuestions, screeningTime, totalInterviewMinutes);
    
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
      
      // Process questions; complexity/estimatedMinutes optional (model may omit when Gemini decides)
      const batchQuestions = (parsed.questions || []).map((q: AIQuestionResponse, idx: number) => {
        let complexity = q.complexity || "moderate";
        if (!["simple", "moderate", "complex"].includes(complexity)) {
          complexity = "moderate";
        }
        let estimatedMinutes = q.estimatedMinutes;
        if (estimatedMinutes == null || typeof estimatedMinutes !== "number") {
          estimatedMinutes = DEFAULT_ESTIMATED_MINUTES;
        }
        const corrected = q.complexity ? autoCorrectComplexity({ question: q.question, complexity }) : { complexity: complexity as "simple" | "moderate" | "complex", estimatedMinutes, corrected: false };
        
        return {
          id: q.id || `q_${generateId()}`,
          competencyId: q.competencyId || competencies[idx % competencies.length]?.id || "comp_1",
          question: q.question,
          complexity: corrected.complexity,
          estimatedMinutes: corrected.estimatedMinutes ?? estimatedMinutes,
          rubric: q.rubric || { typicalReasoning: "", goodSignals: [], moderateSignals: [], poorSignals: [], notes: "" },
          isMandatory: allQuestions.length + idx < maxQuestions,
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

  // Ask Gemini to do proper time analysis and select which questions fit in screening time
  let inclusionResult: { includedIds: string[] } | null = null;
  {
    const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);
    const analysisResult = await analyzeAndSelectIncludedQuestions(allQuestions, screeningTime, contentBudget);
    if (analysisResult) {
      inclusionResult = { includedIds: analysisResult.includedIds };
      const includedSet = new Set(analysisResult.includedIds);
      allQuestions = allQuestions.map((q) => ({ ...q, isMandatory: includedSet.has(q.id) }));
    }
  }
  allQuestions = enforceTimeBudget(allQuestions, interviewDuration, { useGeminiInclusion: !!inclusionResult });

  const finalCounts = countByComplexity(allQuestions.filter(q => q.isMandatory) as Array<{ complexity?: string }>);
  const finalTime = calculateTotalMinutes(finalCounts);
  
  geminiLog.success(`Batched generation complete: ${allQuestions.length} questions, ${finalTime.toFixed(1)} min Q&A time`);
  
  return { competencies, questions: allQuestions, history: currentHistory };
}

/**
 * Build prompt for the first batch (includes competency extraction).
 * Uses SME-style wording; screening and total interview time only—no complexity tiers; Gemini decides question count and types.
 */
function buildFirstBatchPrompt(
  jdText: string,
  smeNotes: string | undefined,
  customInstructions: string | undefined,
  companyWebsite: string | undefined,
  location: string | undefined,
  questionsNeeded: number,
  screeningTime: number,
  existingQuestions?: ScreeningQuestion[],
  totalInterviewMinutes?: number
): string {
  const existingQuestionsSection = existingQuestions && existingQuestions.length > 0
    ? `\n\nEXISTING QUESTIONS (DO NOT DUPLICATE):\n${existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n`
    : '';
  const totalTimeLine = totalInterviewMinutes != null && totalInterviewMinutes > 0
    ? `\nTotal interview time for this slot is ${totalInterviewMinutes} minutes. Do not exceed the screening time and keep the overall flow within total interview time.\n`
    : '';
  const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);
  const band = getBandForScreening(screeningTime);
  const mandatoryCount = band.includedCount;
  const excludedCount = band.excludedCount;

  return `You are a subject matter expert in the role that is being hired. Review the JD below for context. In addition, the role is being hired in ${location || "the location specified by the user"}.

Here are notes from the Subject Matter Expert for more context:
${smeNotes || "No SME notes provided."}
${customInstructions ? `\nAdditional custom instructions:\n${customInstructions}\n` : ''}
${companyWebsite ? `Company website: ${companyWebsite}\n` : ''}
${totalTimeLine}

Screening slot is ${screeningTime} minutes. Reserve ${SCREENING_BUFFER_MINUTES} minutes for introductions, transitions, and candidate questions. **Content budget for Q&A: ${contentBudget} minutes.** Generate ${questionsNeeded} questions total: exactly ${mandatoryCount} mandatory (isMandatory: true) and exactly ${excludedCount} additional/excluded (isMandatory: false). The sum of estimatedMinutes for mandatory questions MUST NOT exceed ${contentBudget} minutes. Set estimatedMinutes for each question; ensure the total fits.

According to all of this, create questions with expected answers and a screening criteria (Good-fit answer, moderate-fit answer, bad-fit answer) that will be easy for the hiring manager to ask and also conclude if the candidate is a good-fit. Questions can be scenario-based or ask about a skill directly. Exactly ${excludedCount} questions must be additional (use "isMandatory": false); the rest are mandatory (isMandatory: true).

The objective is so that the hiring manager can save time of the subject matter expert employees by reducing candidates that are clearly not a good-fit and ones that just answer buzzwords and lack needed experience/knowledge.

STRICT: Total estimatedMinutes for isMandatory: true questions must be ≤ ${contentBudget}. Exactly ${excludedCount} questions must be isMandatory: false (excluded). Total: ${questionsNeeded} questions. Do not exceed total interview time${totalInterviewMinutes != null && totalInterviewMinutes > 0 ? ` (${totalInterviewMinutes} minutes)` : ""}.
${existingQuestionsSection}

Produce this in JSON format.

Requirements:
1. Extract 3-5 key competencies from the JD.
2. Generate ${questionsNeeded} questions total: ${mandatoryCount} mandatory (isMandatory: true) and exactly ${excludedCount} additional (isMandatory: false). For each question include estimatedMinutes (number) and a rubric with: typicalReasoning (brief expected reasoning), goodSignals (Good-fit answer criteria), moderateSignals (moderate-fit answer criteria), poorSignals (bad-fit answer criteria), and notes.
3. First ${mandatoryCount} questions (total estimatedMinutes ≤ ${contentBudget}): "isMandatory": true. Last ${excludedCount} questions: "isMandatory": false.

JSON shape:
{
  "competencies": [{ "id": "comp_1", "name": "...", "description": "..." }],
  "questions": [{
    "id": "q_1",
    "competencyId": "comp_1",
    "question": "...",
    "estimatedMinutes": 2.5,
    "rubric": {
      "typicalReasoning": "...",
      "goodSignals": ["...", "..."],
      "moderateSignals": ["...", "..."],
      "poorSignals": ["...", "..."],
      "notes": "..."
    },
    "isMandatory": true,
    "order": 1
  }]
}

Only output valid JSON. No markdown.`;
}

/**
 * Build prompt for subsequent batches (uses existing competencies).
 * Same time and rubric wording as first batch; no complexity tiers.
 */
function buildSubsequentBatchPrompt(
  jdText: string,
  competencies: Competency[],
  questionsNeeded: number,
  existingQuestions: ScreeningQuestion[],
  screeningTime: number,
  totalInterviewMinutes?: number
): string {
  const competencyList = competencies.map(c => `- ${c.id}: ${c.name}`).join('\n');
  const existingList = existingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
  const totalTimeLine = totalInterviewMinutes != null && totalInterviewMinutes > 0
    ? ` Total interview time is ${totalInterviewMinutes} minutes—do not exceed it.`
    : '';
  const contentBudget = Math.max(5, screeningTime - SCREENING_BUFFER_MINUTES);

  return `Continue generating ${questionsNeeded} MORE screening questions for this role.

JOB DESCRIPTION:
${jdText}

USE THESE COMPETENCIES (already extracted):
${competencyList}

ALREADY GENERATED (DO NOT REPEAT):
${existingList}

Screening slot is ${screeningTime} minutes; content budget for Q&A is ${contentBudget} minutes (reserve ${SCREENING_BUFFER_MINUTES} min for intros/transitions). The full set must have exactly ${getBandForScreening(screeningTime).excludedCount} questions with isMandatory: false (excluded); the rest mandatory. The sum of estimatedMinutes for isMandatory: true questions MUST NOT exceed ${contentBudget}. Set estimatedMinutes for each question.${totalTimeLine}
Use the same rubric shape: typicalReasoning, goodSignals (Good-fit), moderateSignals (moderate-fit), poorSignals (bad-fit), notes.

REQUIREMENTS:
1. Generate exactly ${questionsNeeded} NEW unique questions.
2. Distribute across the existing competencies.
3. Include estimatedMinutes (number) per question and rubrics with Good-fit / moderate-fit / bad-fit criteria (goodSignals, moderateSignals, poorSignals).
4. Ensure the full question set has exactly ${getBandForScreening(screeningTime).excludedCount} additional (isMandatory: false) and that total estimatedMinutes for mandatory questions does not exceed ${contentBudget}.

Respond with JSON (NO competencies array, only questions):
{
  "questions": [{
    "id": "q_${existingQuestions.length + 1}",
    "competencyId": "comp_1",
    "question": "...",
    "estimatedMinutes": 2.5,
    "rubric": {
      "typicalReasoning": "...",
      "goodSignals": ["...", "..."],
      "moderateSignals": ["...", "..."],
      "poorSignals": ["...", "..."],
      "notes": "..."
    },
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
  totalInterviewMinutes?: number
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
    totalInterviewMinutes
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
- Simple: Direct debugging step, specific tool usage, quick technical decision
- Moderate: Trade-off analysis, approach explanation, problem diagnosis  
- Complex: Architecture decision, system design, multi-step optimization
Set estimatedMinutes per question as appropriate (no fixed 2.0/2.5/3.0).

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
      "estimatedMinutes": 2.5
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
 * Estimates time per question (interviewer ask + candidate think/respond) without complexity classification.
 */
export async function analyzeQuestionTime(
  questions: ScreeningQuestion[],
  competencies: Competency[],
  configuredScreeningTime: number
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
}> {
  const includedQuestions = questions.filter(q => q.isMandatory);

  if (includedQuestions.length === 0) {
    return {
      totalEstimatedMinutes: 0,
      breakdown: [],
      summary: "No Q&A screening questions are currently included in the interview.",
      recommendation: "Add planned Q&A questions to get a time estimate.",
      withinBudget: true,
    };
  }

  const questionsText = includedQuestions.map((q: any, i) => {
    const comp = competencies.find(c => c.id === q.competencyId);
    return `${i + 1}. [${comp?.name || "General"}] ${q.question}`;
  }).join("\n");

  const prompt = `You are an expert interview consultant analyzing screening questions for a technical interview.

TASK: Estimate the time needed for each question and provide an analysis.

QUESTIONS TO ANALYZE:
${questionsText}

CONFIGURED SCREENING TIME: ${configuredScreeningTime} minutes

For each question, estimate in minutes:
- How long it will take for the interviewer to ask the question
- How long it will take for the candidate to think and respond

Respond with a JSON object:
{
  "totalEstimatedMinutes": <number>,
  "breakdown": [
    {
      "questionId": "<question_id>",
      "questionText": "<first 50 chars of question>...",
      "estimatedMinutes": <number>,
      "reasoning": "<brief explanation>"
    }
  ],
  "summary": "<2-3 sentence summary of the time analysis>",
  "recommendation": "<actionable recommendation based on time budget>",
  "withinBudget": <boolean - true if total <= configured time>
}

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      geminiLog.warn("API key not set, using fallback");
      throw new Error("API key not set");
    }

    const { text } = await generateTextWithRetries(prompt, { modelCandidates: getTimeAnalysisModelCandidates() });
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      geminiLog.error("Failed to find JSON in time analysis response");
      throw new Error("Failed to parse AI response");
    }

    const parsed = safeJsonParse<any>(jsonMatch[0], "time analysis");

    const breakdown = (parsed.breakdown || []).map((item: any, idx: number) => {
      const estimatedMinutes = Number(item.estimatedMinutes);
      const minutes = Number.isFinite(estimatedMinutes) && estimatedMinutes > 0 ? estimatedMinutes : DEFAULT_ESTIMATED_MINUTES;
      return {
        questionId: includedQuestions[idx]?.id || item.questionId,
        questionText: (item.questionText || includedQuestions[idx]?.question?.substring(0, 50) || "") + (includedQuestions[idx]?.question?.length > 50 ? "..." : ""),
        estimatedMinutes: minutes,
        reasoning: item.reasoning || "Estimated time for question",
      };
    });

    const totalEstimatedMinutes = breakdown.length > 0
      ? breakdown.reduce((sum: number, b: { estimatedMinutes: number }) => sum + b.estimatedMinutes, 0)
      : Number(parsed.totalEstimatedMinutes) || 0;
    const withinBudget = totalEstimatedMinutes <= configuredScreeningTime;

    geminiLog.info(`AI time analysis: ${totalEstimatedMinutes.toFixed(1)}/${configuredScreeningTime} min, withinBudget: ${withinBudget}`);

    return {
      totalEstimatedMinutes: Math.round(totalEstimatedMinutes * 10) / 10,
      breakdown,
      summary: parsed.summary || `Total estimated time: ${totalEstimatedMinutes.toFixed(1)} minutes for ${breakdown.length} questions.`,
      recommendation: parsed.recommendation || (withinBudget ? "Within configured screening time." : "Consider reducing questions or increasing screening time."),
      withinBudget: parsed.withinBudget !== undefined ? !!parsed.withinBudget : withinBudget,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    geminiLog.error(`Time analysis error, using fallback: ${errorMessage}`);

    const defaultMinutesPerQuestion = DEFAULT_ESTIMATED_MINUTES;
    const breakdown = includedQuestions.map((q) => ({
      questionId: q.id,
      questionText: q.question.substring(0, 50) + (q.question.length > 50 ? "..." : ""),
      estimatedMinutes: defaultMinutesPerQuestion,
      reasoning: "Fallback estimate (API unavailable)",
    }));
    const totalEstimatedMinutes = breakdown.length * defaultMinutesPerQuestion;
    const withinBudget = totalEstimatedMinutes <= configuredScreeningTime;

    geminiLog.info(`Fallback time analysis: ${totalEstimatedMinutes.toFixed(1)}/${configuredScreeningTime} min`);

    return {
      totalEstimatedMinutes: Math.round(totalEstimatedMinutes * 10) / 10,
      breakdown,
      summary: `Fallback: ${breakdown.length} questions × ${defaultMinutesPerQuestion} min = ${totalEstimatedMinutes.toFixed(1)} minutes.`,
      recommendation: withinBudget ? "Within configured screening time." : "Consider reducing questions or increasing screening time.",
      withinBudget,
    };
  }
}