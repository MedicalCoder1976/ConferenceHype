import {
  JOURNAL_CARDS_PER_GROUP,
  JOURNAL_DISCLAIMER_EVERY_N_GROUPS,
  JOURNAL_DISCLAIMER_SECONDS,
  JOURNAL_MUSIC_SECONDS,
  JOURNAL_OUTRO_SECONDS
} from "@/lib/broadcast/journalShowSchedule";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import { broadcastDisclaimer } from "@/lib/generation/disclaimers";
import { personaForJournalShow, withAssignedVoice } from "@/lib/rundown/slots";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { Persona, Segment } from "@/lib/types";

export const MEETING_WATCH_CONTENT_SECONDS = 75;

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

// Standalone 30-minute broadcast built from an explicit, pre-approved
// card_ids list (a meeting_watch_broadcasts row) -- not tied to any journal
// or the six-slot station daily schedule. Mirrors buildWeekendRoundupSlots
// intentionally: same group/music/disclaimer pacing, same no-journal-filter
// approach, just a different label and outro.
export function buildMeetingWatchSlots({
  segments,
  baseTime,
  meetingWatchBroadcastId,
  meetingLabel,
  showSeconds = 1800
}: {
  segments: Segment[];
  baseTime: Date;
  meetingWatchBroadcastId: string;
  meetingLabel: string;
  showSeconds?: number;
}): BroadcastSlot[] {
  const seen = new Set<string>();
  // Dedupe by segment id, not contentSignature's citation-URL-first key --
  // unlike every other consumer of contentSignature, a Meeting Watch
  // broadcast deliberately holds several distinct real cards that share one
  // source article's URL (design/population, primary result, safety), and
  // the URL-based signature was collapsing all of them down to just the
  // first card per article. Confirmed live in a dry run: 28 real cards from
  // 12 articles came out as only 12 scheduled cards, with the rest of the
  // 30-minute frame padded with plain music instead of real content.
  const eligible = segments.filter((segment) => {
    if (hasMissingIntakeFailureLanguage(`${segment.title} ${segment.summary} ${segment.script}`)) return false;
    if (seen.has(segment.id)) return false;
    seen.add(segment.id);
    return true;
  });
  const persona = personaForJournalShow(baseTime, `meeting-watch-${meetingWatchBroadcastId}`);
  const slots: BroadcastSlot[] = [];
  let at = baseTime;
  let contentIndex = 0;
  let groupIndex = 0;
  // Reserve the outro's time up front instead of relying on the caller's
  // outer time filter to happen to leave room for it. That filter operates
  // on these *nominal* per-slot durations (real Kokoro durations are only
  // known later), so with enough real content to actually fill the show --
  // the normal case here, unlike a typical journal30 show -- the outro's
  // nominal timestamp can land past the frame and get silently dropped,
  // leaving unexplained trailing music with no sign-off. Confirmed live in
  // a dry run once the content-signature dedup bug above was fixed and 23
  // real cards started actually filling the schedule.
  const contentDeadline = addSeconds(baseTime, showSeconds - JOURNAL_OUTRO_SECONDS);
  for (let cursor = 0; cursor < eligible.length && at < contentDeadline; groupIndex += 1) {
    for (let inGroup = 0; inGroup < JOURNAL_CARDS_PER_GROUP && cursor < eligible.length; inGroup += 1) {
      const segment = withAssignedVoice(eligible[cursor], persona, contentIndex, contentIndex === 0, at, false);
      cursor += 1;
      slots.push({
        at,
        kind: "statement",
        durationMinutes: MEETING_WATCH_CONTENT_SECONDS / 60,
        durationSeconds: MEETING_WATCH_CONTENT_SECONDS,
        label: `${persona.name} meeting watch card`,
        segment,
        replaceable: false
      });
      at = addSeconds(at, MEETING_WATCH_CONTENT_SECONDS);
      contentIndex += 1;
    }
    slots.push({
      at,
      kind: "music",
      durationMinutes: JOURNAL_MUSIC_SECONDS / 60,
      durationSeconds: JOURNAL_MUSIC_SECONDS,
      label: "meeting watch music transition",
      replaceable: false
    });
    at = addSeconds(at, JOURNAL_MUSIC_SECONDS);
    if ((groupIndex + 1) % JOURNAL_DISCLAIMER_EVERY_N_GROUPS === 0) {
      const disclaimer = syntheticSegment({
        id: "meeting-watch-disclaimer",
        title: "Important ConferenceHype notice",
        script: broadcastDisclaimer,
        persona,
        at,
        riskFlag: "meeting_watch_disclaimer"
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
    const script = `This concludes this ConferenceHype Meeting Watch highlights broadcast on ${meetingLabel}. Which of these findings could change practice? Tag @conferencehype on X and join the discussion. Share this broadcast with a colleague or your clinical team, like the video, and subscribe with notifications turned on for more Meeting Watch coverage.`;
    const outro = syntheticSegment({
      id: "meeting-watch-outro",
      title: "End of the meeting watch broadcast",
      script,
      persona,
      at,
      riskFlag: "meeting_watch_outro"
    });
    slots.push({
      at,
      kind: "statement",
      durationMinutes: JOURNAL_OUTRO_SECONDS / 60,
      durationSeconds: JOURNAL_OUTRO_SECONDS,
      label: "end of meeting watch broadcast",
      segment: outro,
      replaceable: false
    });
  }
  return slots;
}
