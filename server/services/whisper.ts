import OpenAI from "openai";
import { Blob } from "buffer";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const blob = new Blob([audioBuffer], { type: "audio/webm" });
  const file = new File([blob], "audio.webm", { type: "audio/webm" });
  
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
