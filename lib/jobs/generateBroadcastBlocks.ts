/**
 * LLM-powered 16-minute content generators for the 3-block-per-hour broadcast structure.
 *
 * Each hour has three 20-minute blocks:
 *   Block 1 — ASCO Daily News    (2 min schedule + 2 min hype music + 16 min news)
 *   Block 2 — Social Desk        (2 min schedule + 2 min hype music + 16 min duo discussion)
 *   Block 3 — Exhibit Hall       (2 min schedule + 2 min hype music + 16 min exhibitor tour)
 *
 * Each 16-minute content section = 16 × (40s content + 20s music) = 960 s.
 * The LLM returns 16 chunks of ~90 words each (≈ 40 s at 135 wpm).
 */

import OpenAI from "openai";
import { env } from "@/lib/env";
import { getPersona } from "@/lib/generation/personas";
import { featuredExhibitors, firstTimeExhibitors } from "@/lib/sources/exhibitors";
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
    script: `${persona.name} here from ASCO 2026 at McCormick Place, Chicago. Coverage continues — stay with us for more from the conference floor.`,
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
    return {
      title: c.title?.trim() || "ASCO Update",
      script: trimToSlot(cleanForBroadcast(c.script ?? "")),
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
      const body = item
        ? trimToSlot(cleanForBroadcast(`${item.title}. ${item.excerpt}`))
        : `Coverage continues from the ASCO social desk.`;
      return {
        title: item?.title ?? `Social Update ${i + 1}`,
        script: body,
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
      : "No recent social posts available. Discuss general ASCO 2026 conference energy: what oncologists are excited about, which trial results are generating buzz, and what is happening on the exhibit floor.";

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
// Block 3: Exhibit Hall (floor reporter)
// ---------------------------------------------------------------------------

export async function generateExhibitorBlockChunks(
  hourIndex: number,
  baseTime: Date
): Promise<BlockChunk[]> {
  const persona = getPersona("vesper-quill"); // Vesper Quill — exhibit hall reporter
  const timeLabel = chicagoTimeLabel(baseTime);

  // Rotate through featured exhibitors so each hour covers a fresh batch.
  // 12 exhibitors per block × 16 chunks gives about one company every 1-2 chunks.
  const allFeatured = [...featuredExhibitors, ...firstTimeExhibitors.slice(0, 20)];
  const rotateBy = hourIndex * 12;
  const selected = Array.from(
    { length: 12 },
    (_, i) => allFeatured[(rotateBy + i) % allFeatured.length]
  ).filter(Boolean);

  const exhibitorLines = selected
    .map((e) => {
      const cats = e.categories.slice(0, 3).join(", ");
      const flags = [
        e.featured ? "major pharma/biotech presence" : "",
        e.firstTime ? "first-time exhibitor" : ""
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${e.name}, Booth ${e.booth}${cats ? ` | ${cats}` : ""}${flags ? ` (${flags})` : ""}`;
    })
    .join("\n");

  if (!env.LLM_API_KEY) {
    return fallback(CHUNKS_PER_CONTENT_BLOCK, persona.id, "industry_floor", "Exhibit Hall");
  }

  const prompt = `You are writing a 16-minute live exhibit hall walkthrough broadcast for ASCO 2026 at McCormick Place, Chicago.
Current Chicago time: ${timeLabel}. Broadcast hour index: ${hourIndex + 1}.
Reporter: ${persona.name} — ${persona.specialty}
Style: ${persona.style}

You are live on the exhibit floor, visiting booths, describing what each company is showcasing, and building excitement for attendees to visit.
Generate EXACTLY ${CHUNKS_PER_CONTENT_BLOCK} chunks. Each chunk is ONE spoken segment (~90 words, ~40 seconds). Together = 16-minute floor tour.

ABSOLUTE RULES:
- Zero emojis
- Zero URLs or web addresses
- Zero @handles or #hashtags
- Do not repeat an exhibitor already covered in an earlier chunk of this block
- Reference booth numbers naturally: "head over to booth...", "right here at booth..."
- No medical advice and no investment advice
- Sound like an energetic live radio floor reporter walking the hall
- For ASCO: pronounce it "Ask-oh"

Featured exhibitors at ASCO 2026 (each company has reserved exhibit space):
${exhibitorLines}

Return ONLY valid JSON:
{ "chunks": [ { "title": "Headline (e.g. booth name + angle)", "script": "~90-word spoken copy" }, ... ] }
All ${CHUNKS_PER_CONTENT_BLOCK} chunks required.`;

  try {
    const raw = await callLLM(prompt);
    if (raw.length === 0) {
      return fallback(CHUNKS_PER_CONTENT_BLOCK, persona.id, "industry_floor", "Exhibit Hall");
    }
    return normalizeChunks(raw, persona, null, "industry_floor");
  } catch (err) {
    console.warn(`Exhibitor block LLM error (hour ${hourIndex}): ${err}`);
    return fallback(CHUNKS_PER_CONTENT_BLOCK, persona.id, "industry_floor", "Exhibit Hall");
  }
}
