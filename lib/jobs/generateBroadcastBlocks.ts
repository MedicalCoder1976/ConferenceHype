/**
 * LLM-powered 16-minute content generators for the 3-block-per-hour broadcast structure.
 *
 * Each hour has three 20-minute blocks:
 *   Block 1 — ASCO Daily News    (2 min schedule + 2 min hype music + 16 min news)
 *   Block 2 — Social Desk        (2 min schedule + 2 min hype music + 16 min duo discussion)
 *   Block 3 — Pharma News        (2 min schedule + 2 min hype music + 16 min pharma news)
 *
 * Each 16-minute content section = 16 × (40s content + 20s music) = 960 s.
 * The LLM returns 16 chunks of ~90 words each (≈ 40 s at 135 wpm).
 */

import OpenAI from "openai";
import { env } from "@/lib/env";
import { getPersona } from "@/lib/generation/personas";
import type { IngestedItem, Segment } from "@/lib/types";

export const CHUNKS_PER_CONTENT_BLOCK = 16; // 16 × 60 s = 16 min

export type BlockChunk = {
  title: string;
  script: string;
  personaId: string;
  personaName: string;
  contentType: Segment["contentType"];
};

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------

/** Strip everything that must not reach TTS or a broadcast slide. */
function cleanForBroadcast(text: string): string {
  return (
    text
      // Emojis — Unicode main emoji block + supplemental
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
      // URLs
      .replace(/https?:\/\/[^\s)>\]]+/g, "")
      .replace(/\bwww\.\S+/g, "")
      // @mentions and #hashtags
      .replace(/@\w{1,15}/g, "")
      .replace(/#\w+/g, "")
      // Internal process labels that must never reach air
      .replace(/\bmonitored\s+X\s+(?:voice|narrative|voices)\b/gi, "")
      .replace(/\boperator[- ](?:added|selected)\b[^.!?\n]*/gi, "")
      .replace(/\bapproved\s+for\s+broadcast\b/gi, "")
      // Clean up spacing
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Trim a script to roughly 90 words (40 s at 135 wpm), breaking on a sentence. */
function trimToSlot(text: string, maxWords = 90): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const limited = words.slice(0, maxWords).join(" ");
  const cut = limited.search(/[.!?][^.!?]*$/);
  if (cut > limited.length * 0.4) return limited.slice(0, cut + 1);
  return `${limited}.`;
}

function withNamedThankYouHandoff(
  script: string,
  speakerName: string,
  previousSpeakerName?: string
): string {
  const cleaned = script.trim();
  if (!previousSpeakerName || previousSpeakerName === speakerName) {
    return cleaned;
  }
  if (new RegExp(`\\b(thanks|thank you),?\\s+${previousSpeakerName}\\b`, "i").test(cleaned)) {
    return cleaned;
  }
  return trimToSlot(`Thanks, ${previousSpeakerName}. ${cleaned}`);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

type RawChunk = { title?: string; script?: string; voice?: "A" | "B" };

async function callLLM(prompt: string): Promise<RawChunk[]> {
  if (!env.LLM_API_KEY) return [];
  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.65
  });
  const raw = response.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(raw) as { chunks?: RawChunk[] };
  return (parsed.chunks ?? []).filter((c) => c.script?.trim());
}

// ---------------------------------------------------------------------------
// Fallback generators (no LLM)
// ---------------------------------------------------------------------------

function fallback(
  count: number,
  personaId: string,
  contentType: Segment["contentType"],
  label: string
): BlockChunk[] {
  const persona = getPersona(personaId);
  return Array.from({ length: count }, (_, i) => ({
    title: `${label} update ${i + 1}`,
    script: `${persona.name} here from the ${label} desk. No new source-backed item is ready for this slot, so stay with us for the next update.`,
    personaId: persona.id,
    personaName: persona.name,
    contentType
  }));
}

function fallbackFromItems(
  items: IngestedItem[],
  count: number,
  personaId: string,
  contentType: Segment["contentType"]
): BlockChunk[] {
  const persona = getPersona(personaId);
  return Array.from({ length: count }, (_, i) => {
    const item = items[i % Math.max(items.length, 1)];
    const body = item
      ? trimToSlot(cleanForBroadcast(`${item.title}. ${item.excerpt}`))
      : `Coverage continues from ASCO 2026. More updates coming shortly.`;
    return {
      title: item?.title ?? `ASCO Update ${i + 1}`,
      script: body,
      personaId: persona.id,
      personaName: persona.name,
      contentType
    };
  });
}

function fallbackFromAttributedItems(
  items: IngestedItem[],
  count: number,
  personaId: string,
  contentType: Segment["contentType"]
): BlockChunk[] {
  const persona = getPersona(personaId);
  return Array.from({ length: count }, (_, i) => {
    const item = items[i % Math.max(items.length, 1)];
    const body = item
      ? trimToSlot(
          cleanForBroadcast(
            `According to ${item.sourceName}, ${item.title}. ${item.excerpt}`
          )
        )
      : `No new source-backed pharma item is ready for this slot.`;
    return {
      title: item?.title ?? `Pharma News Update ${i + 1}`,
      script: body,
      personaId: persona.id,
      personaName: persona.name,
      contentType
    };
  });
}

// ---------------------------------------------------------------------------
// Pad / trim chunk array to exactly CHUNKS_PER_CONTENT_BLOCK entries
// ---------------------------------------------------------------------------

function normalizeChunks(
  raw: RawChunk[],
  personaA: ReturnType<typeof getPersona>,
  personaB: ReturnType<typeof getPersona> | null,
  contentType: Segment["contentType"]
): BlockChunk[] {
  const padChunk = (i: number): BlockChunk => {
    const isB = personaB && i % 2 === 1;
    const persona = isB ? personaB : personaA;
    return {
      title: "ASCO Conference Update",
      script: `${persona.name} here. Coverage continues from the conference. More updates coming right up.`,
      personaId: persona.id,
      personaName: persona.name,
      contentType
    };
  };

  const chunks = raw.slice(0, CHUNKS_PER_CONTENT_BLOCK).map((c, i) => {
    const isB = personaB && (c.voice === "B" || (c.voice === undefined && i % 2 === 1));
    const persona = isB ? personaB : personaA;
    const previousPersona = personaB && i > 0 ? (isB ? personaA : personaB) : null;
    return {
      title: c.title?.trim() || "ASCO Update",
      script: personaB
        ? withNamedThankYouHandoff(
            trimToSlot(cleanForBroadcast(c.script ?? "")),
            persona.name,
            previousPersona?.name
          )
        : trimToSlot(cleanForBroadcast(c.script ?? "")),
      personaId: persona.id,
      personaName: persona.name,
      contentType
    };
  });

  while (chunks.length < CHUNKS_PER_CONTENT_BLOCK) {
    chunks.push(padChunk(chunks.length));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Chicago time label helper
// ---------------------------------------------------------------------------

function chicagoTimeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

// ---------------------------------------------------------------------------
// Block 1: ASCO Daily News (single anchor)
// ---------------------------------------------------------------------------

export async function generateNewsBlockChunks(
  mediaItems: IngestedItem[],
  hourIndex: number,
  baseTime: Date
): Promise<BlockChunk[]> {
  const persona = getPersona("echo-sage"); // TumorCrusher — main news anchor
  const timeLabel = chicagoTimeLabel(baseTime);

  if (!env.LLM_API_KEY) {
    return fallbackFromItems(mediaItems, CHUNKS_PER_CONTENT_BLOCK, persona.id, "media_roundup");
  }

  const sourceMaterial =
    mediaItems.length > 0
      ? mediaItems
          .slice(0, 20)
          .map(
            (item, i) =>
              `${i + 1}. [${item.sourceName}] ${cleanForBroadcast(item.title)}.\n   ${cleanForBroadcast(item.excerpt).slice(0, 300)}`
          )
          .join("\n\n")
      : "No ingested articles available. Use general ASCO 2026 conference context: the annual meeting runs May 29 – June 2 at McCormick Place, Chicago, covering late-breaking clinical trials in targeted therapy, immunotherapy, ADCs, and patient-centered oncology research.";

  const prompt = `You are writing a 16-minute live ASCO conference news broadcast for a radio-style stream.
Current Chicago time: ${timeLabel}. Broadcast hour index: ${hourIndex + 1}.
Reporter: ${persona.name} — ${persona.specialty}
Style: ${persona.style}

Generate EXACTLY ${CHUNKS_PER_CONTENT_BLOCK} broadcast script chunks. Each chunk is ONE spoken segment lasting approximately 40 seconds (~90 words at 135 wpm). Together they form a flowing 16-minute news broadcast.

ABSOLUTE RULES (violations disqualify a chunk):
- Zero emojis
- Zero URLs or web addresses
- Zero @handles or #hashtags
- No repeating content already covered in earlier chunks of this block
- No stock intros ("Hello everyone, I'm...") — dive straight into the news
- No medical advice and no investment advice
- Attribute every factual claim to a named source from the list below
- For ASCO: pronounce it "Ask-oh" (already written as you will speak it)
- Each chunk must be substantively different — cover a new story or angle

Source articles:
${sourceMaterial}

Return ONLY valid JSON in this exact shape:
{ "chunks": [ { "title": "Headline (5–10 words)", "script": "~90-word spoken copy" }, ... ] }
All ${CHUNKS_PER_CONTENT_BLOCK} chunks required.`;

  try {
    const raw = await callLLM(prompt);
    if (raw.length === 0) {
      return fallbackFromItems(mediaItems, CHUNKS_PER_CONTENT_BLOCK, persona.id, "media_roundup");
    }
    return normalizeChunks(raw, persona, null, "media_roundup");
  } catch (err) {
    console.warn(`News block LLM error (hour ${hourIndex}): ${err}`);
    return fallbackFromItems(mediaItems, CHUNKS_PER_CONTENT_BLOCK, persona.id, "media_roundup");
  }
}

// ---------------------------------------------------------------------------
// Block 2: Social Desk (duo discussion)
// ---------------------------------------------------------------------------

export async function generateSocialBlockChunks(
  socialItems: IngestedItem[],
  hourIndex: number,
  baseTime: Date
): Promise<BlockChunk[]> {
  const personaA = getPersona("echo-sage");   // TumorCrusher — primary host
  const personaB = getPersona("nova-quinn");  // Nova Quinn — co-host

  const timeLabel = chicagoTimeLabel(baseTime);

  if (!env.LLM_API_KEY) {
    // Alternate personas in the fallback
    return Array.from({ length: CHUNKS_PER_CONTENT_BLOCK }, (_, i) => {
      const item = socialItems[i % Math.max(socialItems.length, 1)];
      const persona = i % 2 === 0 ? personaA : personaB;
      const previousPersona = i > 0 ? (i % 2 === 0 ? personaB : personaA) : null;
      const body = item
        ? trimToSlot(cleanForBroadcast(`${item.title}. ${item.excerpt}`))
        : `Coverage continues from the ASCO social desk.`;
      return {
        title: item?.title ?? `Social Update ${i + 1}`,
        script: withNamedThankYouHandoff(body, persona.name, previousPersona?.name),
        personaId: persona.id,
        personaName: persona.name,
        contentType: "social_signal" as const
      };
    });
  }

  const postLines =
    socialItems.length > 0
      ? socialItems
          .slice(0, 30)
          .map((item, i) => {
            const author = item.author
              ? `${item.author.replace(/^@/, "")} posted: `
              : "";
            const body = cleanForBroadcast(`${item.title}. ${item.excerpt}`).slice(0, 250);
            return `${i + 1}. ${author}${body}`;
          })
          .join("\n")
      : "No recent social posts available. Discuss general ASCO 2026 conference energy: what oncologists are excited about, which trial results are generating buzz, and which pharma announcements are drawing attention.";

  const prompt = `You are writing a 16-minute live ASCO social media roundup for a radio-style stream.
Two reporters are having a live, energetic on-air conversation about the latest ASCO posts.
Current Chicago time: ${timeLabel}. Broadcast hour index: ${hourIndex + 1}.

Reporter A: ${personaA.name} — ${personaA.specialty} — ${personaA.style}
Reporter B: ${personaB.name} — ${personaB.specialty} — ${personaB.style}

Generate EXACTLY ${CHUNKS_PER_CONTENT_BLOCK} chunks alternating A / B / A / B ...
Each chunk is ONE spoken turn (~90 words, ~40 seconds). Together = 16-minute live discussion.

ABSOLUTE RULES:
- Zero emojis
- Zero URLs or web addresses
- Do NOT read @handles or #hashtags aloud — refer to the person or account by name naturally
- Do not repeat any post already discussed in an earlier chunk
- No stock intros — jump straight into the conversation
- No medical advice and no investment advice
- Attribute claims to the named poster or media outlet
- For ASCO: pronounce it "Ask-oh"
- Chunks must alternate voices: chunk 1 = A, chunk 2 = B, chunk 3 = A, etc.
- Every chunk after the first must thank the previous speaker by name before continuing the handoff.

Latest ASCO social posts:
${postLines}

Return ONLY valid JSON:
{ "chunks": [ { "title": "Headline", "script": "~90-word spoken copy", "voice": "A" or "B" }, ... ] }
All ${CHUNKS_PER_CONTENT_BLOCK} chunks required, starting with voice A.`;

  try {
    const raw = await callLLM(prompt);
    if (raw.length === 0) {
      return fallbackFromItems(socialItems, CHUNKS_PER_CONTENT_BLOCK, personaA.id, "social_signal");
    }
    return normalizeChunks(raw, personaA, personaB, "social_signal");
  } catch (err) {
    console.warn(`Social block LLM error (hour ${hourIndex}): ${err}`);
    return fallbackFromItems(socialItems, CHUNKS_PER_CONTENT_BLOCK, personaA.id, "social_signal");
  }
}

// ---------------------------------------------------------------------------
// Block 3: Pharma News (industry news reporter)
// ---------------------------------------------------------------------------

export async function generatePharmaNewsBlockChunks(
  mediaItems: IngestedItem[],
  hourIndex: number,
  baseTime: Date
): Promise<BlockChunk[]> {
  const persona = getPersona("aether-vale");
  const timeLabel = chicagoTimeLabel(baseTime);
  const pharmaPattern =
    /\b(pharma|pharmaceutical|biotech|drug|therapy|therapeutic|pipeline|trial|approval|fda|ema|company|companies|manufacturer|sponsor|adc|antibody|immunotherapy|targeted treatment)\b/i;
  const pharmaItems = mediaItems.filter((item) =>
    pharmaPattern.test(`${item.sourceName} ${item.title} ${item.excerpt}`)
  );

  if (!env.LLM_API_KEY) {
    return pharmaItems.length > 0
      ? fallbackFromAttributedItems(
          pharmaItems,
          CHUNKS_PER_CONTENT_BLOCK,
          persona.id,
          "market_watch"
        )
      : fallback(CHUNKS_PER_CONTENT_BLOCK, persona.id, "market_watch", "Pharma News");
  }

  if (pharmaItems.length === 0) {
    return fallback(CHUNKS_PER_CONTENT_BLOCK, persona.id, "market_watch", "Pharma News");
  }

  const sourceMaterial = pharmaItems
    .slice(0, 24)
    .map(
      (item, i) =>
        `${i + 1}. [${item.sourceName}] ${cleanForBroadcast(item.title)}.\n   ${cleanForBroadcast(item.excerpt).slice(0, 300)}`
    )
    .join("\n\n");

  const prompt = `You are writing a 16-minute live pharma news broadcast tied to ASCO 2026.
Current Chicago time: ${timeLabel}. Broadcast hour index: ${hourIndex + 1}.
Reporter: ${persona.name} — ${persona.specialty}
Style: ${persona.style}

Cover source-backed pharmaceutical and biotechnology company news, drug-development updates, regulatory developments, partnerships, and trial announcements relevant to the oncology audience.
Generate EXACTLY ${CHUNKS_PER_CONTENT_BLOCK} chunks. Each chunk is ONE spoken segment (~90 words, ~40 seconds). Together = 16-minute pharma news program.

ABSOLUTE RULES:
- Zero emojis
- Zero URLs or web addresses
- Zero @handles or #hashtags
- Attribute every factual claim to a named source from the list below
- Do not repeat a story already covered in an earlier chunk of this block
- Clearly distinguish company announcements from independent reporting
- Do not turn company statements into endorsements or validated clinical conclusions
- No medical advice and no investment advice
- Do not use buy, sell, hold, stock-price, or investment language
- Sound like an energetic but precise pharma news reporter
- For ASCO: pronounce it "Ask-oh"

Source articles:
${sourceMaterial}

Return ONLY valid JSON:
{ "chunks": [ { "title": "Pharma headline", "script": "~90-word spoken copy" }, ... ] }
All ${CHUNKS_PER_CONTENT_BLOCK} chunks required.`;

  try {
    const raw = await callLLM(prompt);
    if (raw.length === 0) {
      return fallbackFromAttributedItems(
        pharmaItems,
        CHUNKS_PER_CONTENT_BLOCK,
        persona.id,
        "market_watch"
      );
    }
    return normalizeChunks(raw, persona, null, "market_watch");
  } catch (err) {
    console.warn(`Pharma news block LLM error (hour ${hourIndex}): ${err}`);
    return fallbackFromAttributedItems(
      pharmaItems,
      CHUNKS_PER_CONTENT_BLOCK,
      persona.id,
      "market_watch"
    );
  }
}
