import { personas } from "@/lib/generation/personas";
import { formatVoiceSegment } from "@/lib/broadcast/voiceSegment";
import {
  CONTENT_CARDS_PER_HOUR,
  CONTENT_SECONDS,
  CONTENT_SLOTS_PER_MUSIC_BLOCK,
  MUSIC_BLOCKS_PER_HOUR,
  MUSIC_SECONDS,
  addSeconds
} from "@/lib/broadcast/hourSchedule";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import type { Persona, Segment } from "@/lib/types";

// Each broadcast hour uses exactly 4 voices, one per equal-size section of the
// hour's content cards, so the hour doesn't sound like back-to-back strangers.
const VOICES_PER_HOUR = 4;
const CARDS_PER_VOICE_SECTION = CONTENT_CARDS_PER_HOUR / VOICES_PER_HOUR;

export type BroadcastSlot = {
  at: Date;
  kind: "music" | "schedule" | "social" | "statement" | "backup";
  durationMinutes: number;
  durationSeconds: number;
  segment?: Segment;
  label: string;
  replaceable?: boolean;
};

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
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

// Picks 4 distinct personas for the hour, deterministic on the hour's start
// time so the same hour always gets the same 4 voices but different hours vary.
function personasForHour(hourStart: Date): Persona[] {
  const pool = [...personas];
  const picked: Persona[] = [];
  let seed = hashValue(hourStart.toISOString());
  for (let index = 0; index < VOICES_PER_HOUR && pool.length > 0; index += 1) {
    seed = hashValue(`${seed}`);
    const pickIndex = seed % pool.length;
    picked.push(pool[pickIndex]);
    pool.splice(pickIndex, 1);
  }
  return picked;
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

function cleanForbiddenBroadcastPhrases(value: string) {
  return value
    // Existing internal meta-language replacements
    .replace(/\bwe verify\b/gi, "we attribute")
    .replace(/\bverify\b/gi, "check")
    .replace(/\bverified\b/gi, "attributed")
    .replace(/\bsource[- ]backed\s+item\b/gi, "covered item")
    .replace(/\bsource[- ]backed\b/gi, "source-attributed")
    .replace(/\bairtime\b/gi, "the rundown")
    .replace(/\baired\b/gi, "covered")
    .replace(/\bairing\b/gi, "playing")
    .replace(/\bair\b/gi, "play")
    // Rule 1: strip URLs — listeners cannot read a URL
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    // Rule 3: strip internal process labels
    .replace(/\boperator[- ](?:added|selected)\b[^.!?\n]*/gi, "")
    .replace(/\bsource[- ]only\s+schedule\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bcheck(?:ing)?\s+using\s+official\s+meeting\s+sources\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bofficial\s+source\s+desk\s+is\s+monitoring\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bConference\s*Hype\s+ASCO\s+energy\s*,?\s+all\s+day\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
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
    // Strip bare URLs (http/https and www.)
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    .replace(/\bwww\.\S+/g, "")
    // Punctuation: colon (not in times like 9:30) → pause comma
    .replace(/(?<!\d):(?!\d{2})/g, ",")
    // Em/en dashes → natural pause
    .replace(/\s*[—–]\s*/g, ", ")
    // Bullet points → sentence break
    .replace(/[•·]\s*/g, ". ")
    // Remove brackets/parens (citations, meta info)
    .replace(/\[[^\]]{1,80}\]/g, "")
    .replace(/\([^)]{1,80}\)/g, "")
    // Percent sign → "percent"
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/\bIb\b/g, "one B")
    .replace(/\b1b\b/gi, "one B")
    // Clean up stray commas and spaces
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function withAssignedVoice(
  segment: Segment,
  persona: Persona,
  slotIndex: number,
  includeIntro: boolean,
  at: Date
): Segment {
  let narrative = cleanForbiddenBroadcastPhrases(stripIntro(segment.script || segment.summary));

  // Rule 6: X/social posts — drop @ and # tags, label as ConferenceHype call-out
  if (segment.contentType === "social_signal") {
    narrative = `ConferenceHype calls out: ${cleanSocialScript(narrative)}`;
  }

  const summary = cleanForbiddenBroadcastPhrases(segment.summary);
  return {
    ...segment,
    personaId: persona.id,
    personaName: persona.name,
    script: formatVoiceSegment({
      voiceName: persona.name,
      topic: segment.title,
      narrative,
      at,
      cardIndex: slotIndex,
      includeIntro
    }),
    summary
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
  hours = 1
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
    const hourVoices = personasForHour(hourStart);
    for (let blockIndex = 0; blockIndex < MUSIC_BLOCKS_PER_HOUR; blockIndex += 1) {
      const blockStart = addSeconds(
        hourStart,
        blockIndex * CONTENT_SLOTS_PER_MUSIC_BLOCK * (CONTENT_SECONDS + MUSIC_SECONDS)
      );
      for (let cardIndex = 0; cardIndex < CONTENT_SLOTS_PER_MUSIC_BLOCK; cardIndex += 1) {
        const contentIndex =
          blockIndex * CONTENT_SLOTS_PER_MUSIC_BLOCK + cardIndex;
        const slotIndex = hourIndex * CONTENT_CARDS_PER_HOUR + contentIndex;
        const contentAt = addSeconds(blockStart, cardIndex * (CONTENT_SECONDS + MUSIC_SECONDS));
        const scheduledSegment = scheduled.bySlot.get(slotKey(contentAt));
        if (!scheduledSegment && allContent.length === 0) {
          slots.push({
            at: contentAt,
            kind: "music",
            durationMinutes: CONTENT_SECONDS / 60,
            durationSeconds: CONTENT_SECONDS,
            label: "music transition",
            replaceable: false
          });
          continue;
        }
        const sourceSegment =
          scheduledSegment ?? allContent[contentIndex % allContent.length];
        if (
          hasMissingIntakeFailureLanguage(
            `${sourceSegment.title} ${sourceSegment.summary} ${sourceSegment.script}`
          )
        ) {
          slots.push({
            at: contentAt,
            kind: "music",
            durationMinutes: CONTENT_SECONDS / 60,
            durationSeconds: CONTENT_SECONDS,
            label: "music transition",
            replaceable: false
          });
          continue;
        }
        const sectionIndex = Math.floor(contentIndex / CARDS_PER_VOICE_SECTION);
        const persona = hourVoices[sectionIndex] ?? hourVoices[hourVoices.length - 1];
        const includeIntro = contentIndex % CARDS_PER_VOICE_SECTION === 0;
        const segment = withAssignedVoice(sourceSegment, persona, slotIndex, includeIntro, contentAt);
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
          at: addSeconds(contentAt, CONTENT_SECONDS),
          kind: "music",
          durationMinutes: MUSIC_SECONDS / 60,
          durationSeconds: MUSIC_SECONDS,
          label: "20-second transition",
          replaceable: false
        });
      }
    }
  }

  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function buildBroadcastHourBuckets(slots: BroadcastSlot[], baseTime: Date, hours = 1) {
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
