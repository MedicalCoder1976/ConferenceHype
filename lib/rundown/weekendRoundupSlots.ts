import {
  JOURNAL_CARDS_PER_GROUP,
  JOURNAL_CONTENT_SECONDS,
  JOURNAL_DISCLAIMER_EVERY_N_GROUPS,
  JOURNAL_DISCLAIMER_SECONDS,
  JOURNAL_MUSIC_SECONDS,
  JOURNAL_OUTRO_SECONDS
} from "@/lib/broadcast/journalShowSchedule";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import { broadcastDisclaimer } from "@/lib/generation/disclaimers";
import { contentSignature } from "@/lib/segments/contentSignature";
import { personaForJournalShow, withAssignedVoice } from "@/lib/rundown/slots";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { Persona, Segment } from "@/lib/types";

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function syntheticSegment({
  id,
  title,
  script,
  persona,
  at,
  riskFlag
}: {
  id: string;
  title: string;
  script: string;
  persona: Persona;
  at: Date;
  riskFlag: string;
}): Segment {
  return {
    id: `${id}-${at.toISOString()}`,
    title,
    summary: script,
    script,
    contentType: "media_roundup",
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "restrained",
    language: "English",
    status: "approved",
    citations: [],
    socialBuzzItems: [],
    riskFlags: [riskFlag],
    confidenceScore: 100,
    createdAt: at.toISOString()
  };
}

export function buildWeekendRoundupSlots({
  segments,
  baseTime,
  part
}: {
  segments: Segment[];
  baseTime: Date;
  part: number;
}): BroadcastSlot[] {
  const seen = new Set<string>();
  const eligible = segments.filter((segment) => {
    if (hasMissingIntakeFailureLanguage(`${segment.title} ${segment.summary} ${segment.script}`)) return false;
    const signature = contentSignature(segment);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  const persona = personaForJournalShow(baseTime, `weekend-roundup-${part}`);
  const slots: BroadcastSlot[] = [];
  let at = baseTime;
  let contentIndex = 0;
  let groupIndex = 0;
  for (let cursor = 0; cursor < eligible.length; groupIndex += 1) {
    for (let inGroup = 0; inGroup < JOURNAL_CARDS_PER_GROUP && cursor < eligible.length; inGroup += 1) {
      const segment = withAssignedVoice(eligible[cursor], persona, contentIndex, contentIndex === 0, at, false);
      cursor += 1;
      slots.push({
        at,
        kind: "statement",
        durationMinutes: JOURNAL_CONTENT_SECONDS / 60,
        durationSeconds: JOURNAL_CONTENT_SECONDS,
        label: `${persona.name} weekend roundup card`,
        segment,
        replaceable: false
      });
      at = addSeconds(at, JOURNAL_CONTENT_SECONDS);
      contentIndex += 1;
    }
    slots.push({
      at,
      kind: "music",
      durationMinutes: JOURNAL_MUSIC_SECONDS / 60,
      durationSeconds: JOURNAL_MUSIC_SECONDS,
      label: "weekend roundup music transition",
      replaceable: false
    });
    at = addSeconds(at, JOURNAL_MUSIC_SECONDS);
    if ((groupIndex + 1) % JOURNAL_DISCLAIMER_EVERY_N_GROUPS === 0) {
      const disclaimer = syntheticSegment({
        id: "weekend-roundup-disclaimer",
        title: "Important ConferenceHype notice",
        script: broadcastDisclaimer,
        persona,
        at,
        riskFlag: "journal_show_disclaimer"
      });
      slots.push({
        at,
        kind: "statement",
        durationMinutes: JOURNAL_DISCLAIMER_SECONDS / 60,
        durationSeconds: JOURNAL_DISCLAIMER_SECONDS,
        label: "disclaimer",
        segment: disclaimer,
        replaceable: false
      });
      at = addSeconds(at, JOURNAL_DISCLAIMER_SECONDS);
    }
  }
  if (contentIndex > 0) {
    const script = "This concludes the ConferenceHype Weekend Roundup of the top medical journal articles of the week. Which study could change practice, and which paper should we revisit in greater depth? If we missed an important article, tag @conferencehype on X and join the discussion. Share this roundup with a colleague or your clinical team, add your perspective in the comments, like the video, and subscribe with notifications turned on for next week's journal coverage.";
    const outro = syntheticSegment({
      id: "weekend-roundup-outro",
      title: "End of the weekend roundup",
      script,
      persona,
      at,
      riskFlag: "weekend_roundup_outro"
    });
    slots.push({
      at,
      kind: "statement",
      durationMinutes: JOURNAL_OUTRO_SECONDS / 60,
      durationSeconds: JOURNAL_OUTRO_SECONDS,
      label: "end of weekend roundup",
      segment: outro,
      replaceable: false
    });
  }
  return slots;
}