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

const CONTENT_SECONDS = 110;
const MUSIC_SECONDS = 10;
const CONTENT_SLOTS_PER_HOUR = 30;

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

function cleanForbiddenBroadcastPhrases(value: string) {
  return value
    .replace(/\bwe verify\b/gi, "we attribute")
    .replace(/\bverify\b/gi, "check")
    .replace(/\bverified\b/gi, "source-backed")
    .replace(/\bairtime\b/gi, "the rundown")
    .replace(/\baired\b/gi, "covered")
    .replace(/\bairing\b/gi, "playing")
    .replace(/\bair\b/gi, "play")
    .replace(/\s+/g, " ")
    .trim();
}

function withAssignedVoice(segment: Segment, slotIndex: number): Segment {
  const persona = voiceForSlot(segment, slotIndex);
  const narrative = cleanForbiddenBroadcastPhrases(stripIntro(segment.script || segment.summary));
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
    script: `${persona.name} here from ASCO. This is a short schedule bridge while the desk waits for the next source-backed card. The next card stays tied to official schedule items, monitored X voices, articles, operator statements, emergency content, or sponsor messages.`,
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
  const allContent = uniqueSegments([
    ...scheduleSegments,
    ...socialVoiceSegments,
    ...segments,
    ...reviewSegments
  ]);
  const slots: BroadcastSlot[] = [];

  for (let hourIndex = 0; hourIndex < hours; hourIndex += 1) {
    const hourStart = addMinutes(baseTime, hourIndex * 60);
    for (let pairIndex = 0; pairIndex < CONTENT_SLOTS_PER_HOUR; pairIndex += 1) {
      const slotIndex = hourIndex * CONTENT_SLOTS_PER_HOUR + pairIndex;
      const contentAt = addSeconds(hourStart, pairIndex * (CONTENT_SECONDS + MUSIC_SECONDS));
      const musicAt = addSeconds(contentAt, CONTENT_SECONDS);
      const sourceSegment =
        allContent.length > 0
          ? allContent[pairIndex % allContent.length]
          : makeFallbackSegment(baseTime, slotIndex);
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
