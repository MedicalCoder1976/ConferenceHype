import OpenAI from "openai";
import { env } from "@/lib/env";

// Reuses the same Grok-compatible chat-completion client already used for
// script generation (lib/generation/llm.ts) -- translation is plain
// text-to-text, so it doesn't need the real-OpenAI key the Korean TTS path
// requires (see lib/media/tts.ts's synthesizeKoreanSpeech).
// spellNumbers: MeloTTS reads digits unreliably, so the free-voice path asks
// for every number written out as spoken Korean.
//
// A second pass checks the Korean against the English and corrects it: the
// first live test (2026-10-28) turned "ran from October 23 to 27" into a
// ten-day meeting and left "futility" untranslated.
export async function translateToKorean(script: string, options: { spellNumbers?: boolean } = {}): Promise<string> {
  if (!env.LLM_API_KEY) {
    throw new Error("Korean translation requires LLM_API_KEY to be configured.");
  }
  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const numbers = options.spellNumbers
    ? "Write every number, decimal, percentage and date out in Korean words exactly as a news anchor would say it aloud (for example 0.68 as 영 점 육팔, 54.4 percent as 오십사 점 사 퍼센트, 2026 as 이천이십육 년), with no digits left. "
    : "";
  const rules = `Keep drug names, company names, and trial/study names in the form Korean medical media commonly uses for them (transliterate if there is no established Korean term; do not invent a translation for a proper noun). Translate every ordinary English word, including technical terms such as futility, hazard ratio or open-label, into the Korean term Korean medical media use. Preserve every factual claim, number, date and duration exactly -- do not add, remove, infer, or soften anything. ${numbers}`;

  const ask = async (content: string) => {
    const response = await client.chat.completions.create({
      model: env.LLM_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0.1
    });
    return response.choices[0]?.message.content?.trim();
  };

  const draft = await ask(
    `Translate the following spoken medical-broadcast narration into natural, professionally-toned spoken Korean, as a news anchor would deliver it aloud. ${rules}Return only the Korean translation, no notes, no quotation marks, no romanization.\n\n${script}`
  );
  if (!draft) {
    throw new Error("Korean translation returned no content.");
  }

  const checked = await ask(
    `Below is an English medical-broadcast narration and its Korean translation. Check the Korean sentence by sentence against the English: any fact, number, date, duration, name or claim that was added, dropped, changed or inferred must be corrected to match the English exactly, and any English word left untranslated (other than a drug, company or trial name) must be translated. ${rules}Return only the corrected Korean translation, with no notes.\n\nENGLISH:\n${script}\n\nKOREAN:\n${draft}`
  );
  return checked || draft;
}
