import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Competency, ScreeningQuestion, InterviewReport, TranscriptEntry, AISuggestion, InterviewNotes, AnswerEvaluation } from "@shared/schema";

const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
if (!apiKey) {
  console.warn("[gemini] WARNING: No API key found. Set GOOGLE_AI_API_KEY environment variable.");
}
const genAI = new GoogleGenerativeAI(apiKey);

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export async function extractCompetenciesAndQuestions(
  jdText: string,
  smeNotes?: string,
  customInstructions?: string,
  companyWebsite?: string,
  interviewDuration?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[] }> {
  // Calculate target question count based on interview duration
  // Default: 12 questions for 30 minutes, scale up/down proportionally
  // Range: 10-15 questions (Phase 1 requirement)
  let targetQuestionCount = 12; // Default for 30 minutes
  if (interviewDuration) {
    // Scale: 30 min = 12 questions, 15 min = 10 questions, 45 min = 15 questions
    targetQuestionCount = Math.round(10 + (interviewDuration - 15) * (5 / 30));
    targetQuestionCount = Math.max(10, Math.min(15, targetQuestionCount)); // Clamp to 10-15
  }

  const prompt = `You are an expert HR consultant and interview coach. Analyze the following job description and extract key competencies, then generate screening interview questions for each competency.

JOB DESCRIPTION:
${jdText}

${companyWebsite ? `COMPANY WEBSITE: ${companyWebsite}\nPlease research and understand the company's culture, values, and work environment. Adjust questions to align with the company's specific needs and culture.\n` : ""}

${smeNotes ? `SME NOTES (Subject Matter Expert guidance):\n${smeNotes}\n` : ""}

${customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n` : ""}

Instructions:
1. Extract 3-5 key competencies from the job description${companyWebsite ? " and company context" : ""}
2. Generate exactly ${targetQuestionCount} screening questions total, distributed across these competencies
3. Ensure questions are well-distributed (not all questions for one competency)
4. ${companyWebsite ? "Consider the company's culture and values when crafting questions. " : ""}For each question, provide a rubric with:
   - typicalReasoning: What reasoning or approach should a good candidate show
   - strongSignals: 3-4 specific indicators of a strong answer
   - weakSignals: 3-4 specific red flags or weak indicators
   - notes: Any special considerations for this question

IMPORTANT: You must generate exactly ${targetQuestionCount} questions total. Count them carefully.

Respond with a JSON object in this exact format:
{
  "competencies": [
    {
      "id": "comp_1",
      "name": "Technical Problem Solving",
      "description": "Ability to break down complex problems and develop systematic solutions"
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "competencyId": "comp_1",
      "question": "Tell me about a time you solved a particularly challenging technical problem...",
      "rubric": {
        "typicalReasoning": "The candidate should describe a systematic approach...",
        "strongSignals": ["Clear problem breakdown", "Multiple approaches considered"],
        "weakSignals": ["Vague about actual contribution", "No mention of outcome"],
        "notes": "Pay attention to whether they can articulate the problem clearly"
      },
      "isMandatory": true,
      "order": 1
    }
  ]
}

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log("[gemini] Raw AI response length:", text.length);
    console.log("[gemini] Raw AI response preview:", text.substring(0, 200));
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[gemini] Failed to find JSON in response. Full response:", text);
      throw new Error("Failed to parse AI response as JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate question count (Phase 1 requirement: 10-15 questions)
    const questionCount = parsed.questions?.length || 0;
    const expectedMin = interviewDuration ? Math.max(10, targetQuestionCount - 2) : 10;
    const expectedMax = interviewDuration ? Math.min(15, targetQuestionCount + 2) : 15;
    if (questionCount < expectedMin || questionCount > expectedMax) {
      console.warn(`[gemini] Warning: Generated ${questionCount} questions, expected ${expectedMin}-${expectedMax}`);
    }
    
    const competencies = (parsed.competencies || []).map((c: any, idx: number) => ({
      id: c.id || `comp_${generateId()}`,
      name: c.name,
      description: c.description,
    }));

    const questions = (parsed.questions || []).map((q: any, idx: number) => ({
      id: q.id || `q_${generateId()}`,
      competencyId: q.competencyId,
      question: q.question,
      rubric: {
        typicalReasoning: q.rubric?.typicalReasoning || "",
        strongSignals: q.rubric?.strongSignals || [],
        weakSignals: q.rubric?.weakSignals || [],
        notes: q.rubric?.notes || "",
      },
      isMandatory: q.isMandatory ?? true,
      order: q.order || idx + 1,
    }));

    return { competencies, questions };
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
  interviewDuration?: number
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[] }> {
  return extractCompetenciesAndQuestions(jdText, smeNotes, customInstructions, companyWebsite, interviewDuration);
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

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) return [];
    
    const suggestions = JSON.parse(jsonMatch[0]);
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
- Strong Signals: ${question.rubric.strongSignals.join(", ")}
- Weak Signals: ${question.rubric.weakSignals.join(", ")}

${question.rubric.notes ? `- Notes: ${question.rubric.notes}` : ""}

CANDIDATE'S ANSWER:
${candidateAnswer}

CONTEXT (recent conversation):
${fullTranscript.slice(-5).map(t => `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`).join("\n")}

Evaluate the candidate's answer and respond with a JSON object:
{
  "quality": "strong" | "moderate" | "weak",
  "score": 1-5,
  "strongSignalsFound": ["signal1", "signal2"],
  "weakSignalsFound": ["signal1", "signal2"],
  "reasoning": "Brief explanation of why this quality/score was assigned"
}

Guidelines:
- "strong": Answer demonstrates most strong signals, clear reasoning, specific examples
- "moderate": Answer shows some strong signals but also some weak signals or lacks depth
- "weak": Answer shows weak signals, lacks specifics, or doesn't address the question well
- Score: 1-5 (1=very weak, 3=moderate, 5=excellent)
- List actual signals found in the answer
- Be objective and evidence-based

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      console.warn("[gemini] Cannot evaluate answer: API key not set");
      return {
        quality: "moderate",
        score: 3,
        signals: { strong: [], weak: [] },
        reasoning: "Evaluation unavailable - API key not configured",
        questionId: question.id,
      };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("[gemini] Failed to parse answer evaluation response");
      return {
        quality: "moderate",
        score: 3,
        signals: { strong: [], weak: [] },
        reasoning: "Failed to parse evaluation",
        questionId: question.id,
      };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      quality: parsed.quality === "strong" || parsed.quality === "weak" ? parsed.quality : "moderate",
      score: Math.min(5, Math.max(1, parsed.score || 3)),
      signals: {
        strong: parsed.strongSignalsFound || [],
        weak: parsed.weakSignalsFound || [],
      },
      reasoning: parsed.reasoning || "Evaluation completed",
      questionId: question.id,
    };
  } catch (error: any) {
    console.error("[gemini] Answer evaluation error:", error);
    return {
      quality: "moderate",
      score: 3,
      signals: { strong: [], weak: [] },
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
- Be balanced - highlight both strengths and areas for improvement
- The decision should be "Hire", "No-Hire", or "Hold" and be well-justified

Only output valid JSON. No markdown code blocks.`;

  try {
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is not set. Please configure your API key in the environment variables.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("[gemini] Failed to find JSON in report response. Full response:", text);
      throw new Error("Failed to parse AI response as JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
