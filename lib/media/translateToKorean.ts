import OpenAI from "openai";
import { env } from "@/lib/env";

// Reuses the same Grok-compatible chat-completion client already used for
// script generation (lib/generation/llm.ts) -- translation is plain
// text-to-text, so it doesn't need the real-OpenAI key the Korean TTS path
// requires (see lib/media/tts.ts's synthesizeKoreanSpeech).
export async function translateToKorean(script: string): Promise<string> {
  if (!env.LLM_API_KEY) {
    throw new Error("Korean translation requires LLM_API_KEY to be configured.");
  }
  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [
      {
        role: "user",
        content: `Translate the following spoken medical-broadcast narration into natural, professionally-toned spoken Korean, as a news anchor would deliver it aloud. Keep drug names, company names, and trial/study names in the form Korean medical media commonly uses for them (transliterate if there is no established Korean term; do not invent a translation for a proper noun). Preserve every factual claim and number exactly -- do not add, remove, or soften any claim. Return only the Korean translation, no notes, no quotation marks, no romanization.

${script}`
      }
    ],
    temperature: 0.2
  });
  const translated = response.choices[0]?.message.content?.trim();
  if (!translated) {
    throw new Error("Korean translation returned no content.");
  }
  return translated;
}
