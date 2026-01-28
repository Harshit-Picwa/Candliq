import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { TranscriptEntry } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const file = await toFile(audioBuffer, "audio.webm", {
    type: "audio/webm",
  });
  
  try {
    const response = await openai.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: file,
      response_format: "json",
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Whisper transcription error:", error);
    
    if (error.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return transcribeAudio(audioBuffer);
    }
    
    return "";
  }
}

/**
 * Detects speaker based on conversation patterns and heuristics
 * Uses conversation flow, question patterns, and context to determine speaker
 */
export function detectSpeaker(
  text: string,
  transcript: TranscriptEntry[],
  isFirstInTurn: boolean = true
): "interviewer" | "candidate" {
  const trimmedText = text.trim();
  
  // If this is the first entry in the conversation, likely interviewer
  if (transcript.length === 0) {
    return "interviewer";
  }
  
  // If last speaker was candidate, this is likely interviewer (alternating pattern)
  const lastEntry = transcript[transcript.length - 1];
  if (lastEntry && lastEntry.speaker === "candidate" && isFirstInTurn) {
    return "interviewer";
  }
  
  // If last speaker was interviewer, this is likely candidate
  if (lastEntry && lastEntry.speaker === "interviewer" && isFirstInTurn) {
    return "candidate";
  }
  
  // Question patterns indicate interviewer
  const questionPatterns = [
    /^(tell me|can you|how did|what|why|when|where|describe|explain|walk me through|give me an example|tell us about)/i,
    /\?$/,
    /^(so|okay|alright|great|interesting|i see|that's|that is)/i,
  ];
  
  for (const pattern of questionPatterns) {
    if (pattern.test(trimmedText)) {
      return "interviewer";
    }
  }
  
  // Long responses (likely candidate answering)
  if (trimmedText.length > 100 && isFirstInTurn) {
    return "candidate";
  }
  
  // Short responses after interviewer question (likely candidate)
  if (lastEntry?.speaker === "interviewer" && trimmedText.length < 50) {
    return "candidate";
  }
  
  // Default: alternate based on last speaker
  if (lastEntry) {
    return lastEntry.speaker === "interviewer" ? "candidate" : "interviewer";
  }
  
  // Fallback: assume candidate if uncertain
  return "candidate";
}

export async function transcribeAudioWithRetry(
  audioBuffer: Buffer,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transcribeAudio(audioBuffer);
    } catch (error) {
      console.error(`Transcription attempt ${attempt + 1} failed:`, error);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  return "";
}
