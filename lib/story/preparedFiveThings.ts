import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { buildFiveThingsSearchTitle, FIVE_THINGS_SPECIALTIES } from "@/lib/story/fiveThingsConfig";
import { buildFiveThingsDisclaimer } from "@/lib/story/fiveThingsDisclaimer";
import type { Segment } from "@/lib/types";

export const fiveThingsInputSchema = z.object({
  specialty: z.enum(FIVE_THINGS_SPECIALTIES),
  writeup: z.string().trim().min(1_500).max(120_000),
  startsAt: z.string().datetime().optional()
});

export type FiveThingsInput = z.infer<typeof fiveThingsInputSchema>;

type FiveThingsItem = {
  position: number;
  title: string;
  script: string;
  sourceUrl: string;
};

const TRANSITION_SECONDS = 15;
const WORDS_PER_SECOND = 1.95;
const ITEM_HEADING = /^(?:#{1,6}\s*)?(?:item\s*)?([1-5])\s*[).:\-]\s*(.+)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const NUMBER_WORDS = ["one", "two", "three", "four", "five"];

function cleanInline(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function truncateAtWord(value: string, max: number) {
  const cleaned = cleanInline(value);
  if (cleaned.length <= max) return cleaned;
  const prefix = cleaned.slice(0, max + 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.6 ? boundary : max).replace(/[,:;\-–—\s]+$/, "")}…`;
}

function stripStructuralLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:title|specialty|primary source(?: url)?|source(?: url)?)\s*:/i.test(line))
    .map((line) => line.replace(/^(?:intro|what happened|key evidence|why it matters|limitation|what to watch next|outro)\s*:\s*/i, ""))
    .join(" ")
    .replace(URL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceUrl(lines: string[]) {
  const explicit = lines.find((line) => /^(?:primary source(?: url)?|source(?: url)?)\s*:/i.test(line.trim()));
  const candidates = (explicit ?? lines.join("\n")).match(URL_PATTERN) ?? [];
  const value = candidates[0]?.replace(/[.,;:!?]+$/, "");
  if (!value) throw new Error("Every item must include its own Primary source URL.");
  return z.string().url().parse(value);
}

export function parsePreparedFiveThings(input: FiveThingsInput) {
  const parsed = fiveThingsInputSchema.parse(input);
  const lines = parsed.writeup.replace(/```(?:\w+)?/g, "").split(/\r?\n/);
  const headings = lines
    .map((line, index) => ({ index, match: line.trim().match(ITEM_HEADING) }))
    .filter((entry): entry is { index: number; match: RegExpMatchArray } => Boolean(entry.match));
  if (headings.length !== 5 || headings.some((entry, index) => Number(entry.match[1]) !== index + 1)) {
    throw new Error("The write-up must contain exactly five numbered item headings, in order from 1 through 5.");
  }
  const intro = stripStructuralLines(lines.slice(0, headings[0].index));
  const items: FiveThingsItem[] = headings.map((heading, index) => {
    const block = lines.slice(heading.index + 1, headings[index + 1]?.index ?? lines.length);
    const script = stripStructuralLines(block);
    if (wordCount(script) < 55) {
      throw new Error(`Item ${index + 1} needs at least 55 spoken words after labels and source links are removed.`);
    }
    return {
      position: index + 1,
      title: truncateAtWord(heading.match[2], 96),
      script,
      sourceUrl: sourceUrl(block)
    };
  });
  if (new Set(items.map((item) => item.sourceUrl)).size !== 5) {
    throw new Error("The five items must use five distinct primary-source URLs.");
  }
  const spokenWords = items.reduce((total, item) => total + wordCount(item.script), wordCount(intro) + 55);
  if (spokenWords < 400) throw new Error("The five-item write-up needs at least 400 spoken words after structural labels and URLs are removed.");
  const title = buildFiveThingsSearchTitle(parsed.specialty, items.map((item) => item.title));
  const disclaimer = buildFiveThingsDisclaimer(parsed.specialty, items.map((item) => item.title));
  const closingWords = wordCount(disclaimer.text) + 30;
  const durationSeconds = Math.max(360, Math.ceil(((spokenWords + closingWords) / WORDS_PER_SECOND + TRANSITION_SECONDS * 4 + 15) / 15) * 15);
  const sourceHash = createHash("sha256")
    .update(JSON.stringify({ specialty: parsed.specialty, writeup: parsed.writeup.replace(/\s+/g, " ").trim() }))
    .digest("hex");
  return { input: parsed, intro, items, title, spokenWords, durationSeconds, sourceHash };
}

export function preparedFiveThingsSegments(prepared: ReturnType<typeof parsePreparedFiveThings>): Segment[] {
  const now = new Date().toISOString();
  let sequence = 0;
  const makeSegment = ({ title, script, sourceUrl, flags }: { title: string; script: string; sourceUrl?: string; flags: string[] }): Segment => {
    sequence += 1;
    return {
      id: `draft-${randomUUID()}`,
      title,
      summary: script,
      script,
      contentType: "media_roundup",
      personaId: "luna-vale",
      personaName: "Luna Vale",
      hypeLevel: "restrained",
      language: "English",
      status: "approved",
      citations: sourceUrl ? [{ label: `${prepared.input.specialty}: ${title}`, url: sourceUrl, sourceType: "media" }] : [],
      socialBuzzItems: [],
      riskFlags: ["meeting_watch", "prepared_narrative", "prepared_five_things", `prepared_sequence:${String(sequence).padStart(4, "0")}`, ...flags],
      confidenceScore: 90,
      createdAt: now,
      approvedAt: now,
      updatedAt: now
    };
  };
  const segments: Segment[] = [];
  for (const item of prepared.items) {
    const intro = item.position === 1
      ? `Here are five ${prepared.input.specialty.toLowerCase()} developments physicians should know today. ${prepared.intro}`.trim()
      : "";
    const script = `${intro} Number ${NUMBER_WORDS[item.position - 1]}: ${item.title}. ${item.script}`.replace(/\s+/g, " ").trim();
    segments.push(makeSegment({
      title: item.title,
      script,
      sourceUrl: item.sourceUrl,
      flags: [
        `prepared_card:${item.position}`,
        `five_things_item:${item.position}`,
        ...(item.position === 1 ? ["prepared_opening", "prepared_thumbnail:5 THINGS TO KNOW"] : []),
        ...(item.position < 5 ? [`prepared_transition:${TRANSITION_SECONDS}`] : [])
      ]
    }));
  }
  const disclaimer = buildFiveThingsDisclaimer(prepared.input.specialty, prepared.items.map((item) => item.title));
  segments.push(makeSegment({
    title: disclaimer.heading,
    script: `Those are the five ${prepared.input.specialty.toLowerCase()} developments to know today. Review every primary source in the description and share this briefing with a colleague. ${disclaimer.heading.replace(/:$/, ".")} ${disclaimer.text}`,
    flags: ["prepared_disclaimer", "prepared_closing", "five_things_tailored_disclaimer", "prepared_card:6"]
  }));
  return segments;
}
