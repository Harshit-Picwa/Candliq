import OpenAI from "openai";
import type { Competency, ScreeningQuestion, InterviewReport, TranscriptEntry, AISuggestion, InterviewNotes } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export async function extractCompetenciesAndQuestions(
  jdText: string,
  smeNotes?: string
): Promise<{ competencies: Competency[]; questions: ScreeningQuestion[] }> {
  const prompt = `You are an expert HR consultant and interview coach. Analyze the following job description and extract key competencies, then generate screening interview questions for each competency.

JOB DESCRIPTION:
${jdText}

${smeNotes ? `SME NOTES (Subject Matter Expert guidance):\n${smeNotes}\n` : ""}

Instructions:
1. Extract 4-6 key competencies from the job description
2. For each competency, generate 2-3 behavioral interview questions
3. For each question, provide a rubric with:
   - typicalReasoning: What reasoning or approach should a good candidate show
   - strongSignals: 3-4 specific indicators of a strong answer
   - weakSignals: 3-4 specific red flags or weak indicators
   - notes: Any special considerations for this question

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
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 8192,
    });

    const text = response.choices[0]?.message?.content || "";
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response as JSON");
    }

    const result = JSON.parse(jsonMatch[0]);
    
    const competencies = (result.competencies || []).map((c: any, idx: number) => ({
      id: c.id || `comp_${generateId()}`,
      name: c.name,
      description: c.description,
    }));

    const questions = (result.questions || []).map((q: any, idx: number) => ({
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
    console.error("AI API error:", error);
    throw new Error(`AI generation failed: ${error.message}`);
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
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const text = response.choices[0]?.message?.content || "";
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
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 8192,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response as JSON");
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      summary: result.summary || "Report generation incomplete.",
      competencies: (result.competencies || []).map((c: any) => ({
        competencyId: c.competencyId,
        name: c.name,
        score: Math.min(5, Math.max(1, c.score || competencyRatings[c.competencyId] || 3)),
        reason: c.reason,
      })),
      recommendation: {
        decision: result.recommendation?.decision || "Hold",
        reason: result.recommendation?.reason || "Unable to generate recommendation.",
      },
      evidence: (result.evidence || []).map((e: any) => ({
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
