import { personas } from "@/lib/generation/personas";
import type { Segment } from "@/lib/types";

export type BroadcastSlot = {
  at: Date;
  kind: "music" | "schedule" | "social" | "statement" | "backup";
  durationMinutes: number;
  durationSeconds: number;
  segment?: Segment;
  label: string;
  replaceable?: boolean;
};

const CONTENT_SECONDS = 20;   // was 110 — match real TTS length, no more silence gaps
const MUSIC_SECONDS = 20;     // was 10 — matches 20-second gap-clip library
const CONTENT_SLOTS_PER_HOUR = 90; // was 30 — 90 × 40 s = 3 600 s = 1 h exactly

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

export function firstSlotTime(segment: Segment) {
  return new Date(segment.approvedAt ?? segment.createdAt);
}

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function voiceForSlot(segment: Segment, slotIndex: number) {
  return personas[hashValue(`${segment.id}-${slotIndex}`) % personas.length];
}

function stripIntro(value: string) {
  return value
    .replace(/^\s*(?:hey everybody,?\s*)?(?:this is|it'?s)\s+[A-Za-z][A-Za-z\s.'-]{1,40}\s+(?:here|coming to you|from)\b[:,.\s-]*/i, "")
    .replace(/^\s*[A-Za-z][A-Za-z\s.'-]{1,40}\s+here\s+with\b[:,.\s-]*/i, "")
    .trim();
}

// Rule 6 helper: strip @mentions and #tags from social posts
function cleanSocialScript(value: string): string {
  return value
    .replace(/@\w{1,15}/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Limit script to roughly 20 seconds of spoken content (~45 words at 135 wpm).
// Breaks on the last sentence boundary if possible.
function trimToSpokenLength(text: string, maxWords = 45): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const limited = words.slice(0, maxWords).join(" ");
  // Try to end on a sentence boundary in the second half of the truncated text
  const cutPoint = limited.search(/[.!?][^.!?]*$/);
  if (cutPoint > limited.length * 0.4) return limited.slice(0, cutPoint + 1);
  return `${limited}.`;
}

function cleanForbiddenBroadcastPhrases(value: string) {
  return value
    // Existing internal meta-language replacements
    .replace(/\bwe verify\b/gi, "we attribute")
    .replace(/\bverify\b/gi, "check")
    .replace(/\bverified\b/gi, "source-backed")
    .replace(/\bairtime\b/gi, "the rundown")
    .replace(/\baired\b/gi, "covered")
    .replace(/\bairing\b/gi, "playing")
    .replace(/\bair\b/gi, "play")
    // Rule 1: strip URLs — listeners cannot read a URL
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    // Rule 3: strip internal process labels
    .replace(/\boperator[- ](?:added|selected)\b[^.!?\n]*/gi, "")
    .replace(/\bmonitored\s+X\s+(?:voice|narrative|voices)\b/gi, "")
    .replace(/\bsource[- ]backed\s+\w+\s+narrative\b/gi, "")
    .replace(/\bapproved\s+for\s+broadcast\b/gi, "")
    .replace(/\baudience\s+tip\b/gi, "")
    .replace(/\bX\s+narrative\b/gi, "social post")
    .replace(/\bX\s+voice\b/gi, "social voice")
    .replace(/\bsocial\s+buzz\b/gi, "social chatter")
    .replace(/\bearly\s+social\s+chatter\b/gi, "early chatter")
    .replace(/\bunverified\s+buzz\b/gi, "early buzz")
    // Rule 4: ≈ → "approximately"
    .replace(/≈/g, "approximately")
    .replace(/\s+/g, " ")
    .trim();
}

function withAssignedVoice(segment: Segment, slotIndex: number): Segment {
  const persona = voiceForSlot(segment, slotIndex);
  let narrative = cleanForbiddenBroadcastPhrases(stripIntro(segment.script || segment.summary));

  // Rule 6: X/social posts — drop @ and # tags, label as ConferenceHype call-out
  if (segment.contentType === "social_signal") {
    narrative = `ConferenceHype calls out: ${cleanSocialScript(narrative)}`;
  }

  // Rule 2: fit inside a 20-second spoken slot (~45 words at 135 wpm)
  narrative = trimToSpokenLength(narrative, 45);

  const summary = cleanForbiddenBroadcastPhrases(segment.summary);
  return {
    ...segment,
    personaId: persona.id,
    personaName: persona.name,
    script: `${persona.name} here from ASCO. ${narrative}`,
    summary
  };
}

function makeFallbackSegment(baseTime: Date, slotIndex: number): Segment {
  const persona = personas[slotIndex % personas.length];
  const createdAt = addSeconds(baseTime, slotIndex * (CONTENT_SECONDS + MUSIC_SECONDS)).toISOString();
  return {
    id: `virtual-source-backed-hold-${createdAt}-${slotIndex}`,
    title: "Source-backed ASCO schedule bridge",
    summary:
      "No newer ready card is available for this position, so this slot holds a short official-schedule bridge.",
    script: `${persona.name} here from ASCO. Short break while the next confirmed card loads. Coverage continues right after this.`,
    contentType: "agenda_preview",
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "standard",
    language: "English",
    status: "approved",
    citations: [
      {
        label: "ASCO meeting calendar",
        url: "https://meetings.asco.org/",
        sourceType: "official"
      }
    ],
    socialBuzzItems: [],
    riskFlags: ["virtual_schedule_bridge", "no_empty_slot"],
    confidenceScore: 90,
    createdAt,
    approvedAt: createdAt
  };
}

function segmentKind(segment: Segment): BroadcastSlot["kind"] {
  if (segment.contentType === "agenda_preview") {
    return "schedule";
  }
  if (segment.contentType === "social_signal") {
    return "social";
  }
  return "statement";
}

function uniqueSegments(segments: Segment[]) {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    if (seen.has(segment.id)) {
      return false;
    }
    seen.add(segment.id);
    return true;
  });
}

function slotKey(date: Date) {
  return date.getTime();
}

function scheduledSegmentsForWindow(segmentGroups: Segment[][], baseTime: Date, hours: number) {
  const windowEnd = addMinutes(baseTime, hours * 60);
  const bySlot = new Map<number, Segment>();
  const pinnedIds = new Set<string>();

  for (const segments of segmentGroups) {
    for (const segment of segments) {
      if (segment.status !== "approved" || !segment.approvedAt) {
        continue;
      }
      const scheduledAt = firstSlotTime(segment);
      if (scheduledAt < baseTime || scheduledAt >= windowEnd) {
        continue;
      }
      bySlot.set(slotKey(scheduledAt), segment);
      pinnedIds.add(segment.id);
    }
  }

  return { bySlot, pinnedIds };
}

export function buildBroadcastSlots({
  segments,
  reviewSegments = [],
  scheduleSegments,
  socialVoiceSegments = [],
  baseTime,
  hours = 3
}: {
  segments: Segment[];
  reviewSegments?: Segment[];
  scheduleSegments: Segment[];
  socialVoiceSegments?: Segment[];
  baseTime: Date;
  hours?: number;
}) {
  const scheduled = scheduledSegmentsForWindow(
    [scheduleSegments, socialVoiceSegments, segments],
    baseTime,
    hours
  );
  const allContent = uniqueSegments([
    ...segments.filter((segment) => !scheduled.pinnedIds.has(segment.id)),
    ...reviewSegments
  ]);
  const slots: BroadcastSlot[] = [];

  for (let hourIndex = 0; hourIndex < hours; hourIndex += 1) {
    const hourStart = addMinutes(baseTime, hourIndex * 60);
    for (let pairIndex = 0; pairIndex < CONTENT_SLOTS_PER_HOUR; pairIndex += 1) {
      const slotIndex = hourIndex * CONTENT_SLOTS_PER_HOUR + pairIndex;
      const contentAt = addSeconds(hourStart, pairIndex * (CONTENT_SECONDS + MUSIC_SECONDS));
      const musicAt = addSeconds(contentAt, CONTENT_SECONDS);
      const scheduledSegment = scheduled.bySlot.get(slotKey(contentAt));
      const sourceSegment =
        scheduledSegment ??
        (allContent.length > 0
          ? allContent[pairIndex % allContent.length]
          : makeFallbackSegment(baseTime, slotIndex));
      const segment = withAssignedVoice(sourceSegment, slotIndex);
      slots.push({
        at: contentAt,
        kind: segmentKind(segment),
        durationMinutes: CONTENT_SECONDS / 60,
        durationSeconds: CONTENT_SECONDS,
        label: `${segment.personaName} content card`,
        segment,
        replaceable: true
      });
      slots.push({
        at: musicAt,
        kind: "music",
        durationMinutes: MUSIC_SECONDS / 60,
        durationSeconds: MUSIC_SECONDS,
        label: "10-second music card",
        replaceable: false
      });
    }
  }

  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function buildBroadcastHourBuckets(slots: BroadcastSlot[], baseTime: Date, hours = 3) {
  return Array.from({ length: hours }, (_, hourIndex) => {
    const start = addMinutes(baseTime, hourIndex * 60);
    const end = addMinutes(start, 60);
    const hourSlots = slots.filter((slot) => slot.at >= start && slot.at < end);
    return {
      start,
      end,
      slots: hourSlots
    };
  });
}
