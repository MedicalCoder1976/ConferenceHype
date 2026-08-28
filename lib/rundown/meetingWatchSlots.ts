import {
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

function trialConversationKey(segment: Segment) {
  const explicit = segment.riskFlags.find((flag) => flag.startsWith("meeting_trial:"));
  if (explicit) return explicit;
  const titlePrefix = segment.title.split(":", 1)[0]?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return titlePrefix ? `meeting_trial:${titlePrefix}` : `meeting_source:${segment.citations[0]?.url ?? segment.id}`;
}

export function groupMeetingWatchSegmentsByTrial(segments: Segment[]) {
  const groups = new Map<string, Segment[]>();
  for (const segment of segments) {
    const key = trialConversationKey(segment);
    const group = groups.get(key) ?? [];
    group.push(segment);
    groups.set(key, group);
  }
  return [...groups.values()].flat();
}

function meetingWatchTrialGroups(segments: Segment[]) {
  const ordered = groupMeetingWatchSegmentsByTrial(segments);
  const groups: Segment[][] = [];
  for (const segment of ordered) {
    const previous = groups.at(-1);
    if (!previous || trialConversationKey(previous[0]) !== trialConversationKey(segment)) groups.push([segment]);
    else previous.push(segment);
  }
  return groups;
}

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
  const prepared = eligible.length > 0 && eligible.every((segment) => segment.riskFlags.includes("prepared_narrative"));
  const conversationGroups = prepared ? [] : meetingWatchTrialGroups(eligible);
  if (prepared) {
    const ordered = [...eligible].sort((left, right) => {
      const sequence = (segment: Segment) => Number(segment.riskFlags.find((flag) => flag.startsWith("prepared_sequence:"))?.split(":")[1] ?? 0);
      return sequence(left) - sequence(right);
    });
    let preparedAt = baseTime;
    for (const segment of ordered) {
      const words = (segment.script || segment.summary).trim().split(/\s+/).length;
      const seconds = Math.max(15, Math.ceil(words / 2.25) + 2);
      slots.push({ at: preparedAt, kind: "statement", durationMinutes: seconds / 60, durationSeconds: seconds, label: `${segment.personaName} prepared narrative`, segment, replaceable: false });
      preparedAt = addSeconds(preparedAt, seconds);
      const transition = segment.riskFlags.find((flag) => flag.startsWith("prepared_transition:"));
      if (transition) {
        const transitionSeconds = Math.max(10, Math.min(60, Number(transition.split(":")[1]) || JOURNAL_MUSIC_SECONDS));
        slots.push({ at: preparedAt, kind: "music", durationMinutes: transitionSeconds / 60, durationSeconds: transitionSeconds, label: "prepared narrative music transition", replaceable: false });
        preparedAt = addSeconds(preparedAt, transitionSeconds);
      }
    }
    const isPreparedStory = ordered.every((segment) => segment.riskFlags.includes("prepared_story"));
    const endsWithTailoredDisclaimer = ordered.at(-1)?.riskFlags.includes("five_things_tailored_disclaimer") ?? false;
    if (!isPreparedStory && !endsWithTailoredDisclaimer) {
      const closingMusicSeconds = 15;
      slots.push({
        at: preparedAt,
        kind: "music",
        durationMinutes: closingMusicSeconds / 60,
        durationSeconds: closingMusicSeconds,
        label: "Like, subscribe, and recommend the next article",
        replaceable: false
      });
    }
    return slots;
  }
  let at = baseTime;
  let contentIndex = 0;

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
  for (const [groupIndex, conversation] of conversationGroups.entries()) {
    const addDisclaimer = (groupIndex + 1) % JOURNAL_DISCLAIMER_EVERY_N_GROUPS === 0;
    const requiredSeconds = conversation.length * MEETING_WATCH_CONTENT_SECONDS + JOURNAL_MUSIC_SECONDS + (addDisclaimer ? JOURNAL_DISCLAIMER_SECONDS : 0);
    if (addSeconds(at, requiredSeconds) > contentDeadline) break;
    for (const sourceSegment of conversation) {
      const segment = withAssignedVoice(sourceSegment, persona, contentIndex, contentIndex === 0, at, false);
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
    if (addDisclaimer) {
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
