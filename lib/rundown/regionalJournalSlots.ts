import { buildWeekendRoundupSlots } from "@/lib/rundown/weekendRoundupSlots";
import type { Segment } from "@/lib/types";

export function buildRegionalJournalSlots({ segments, baseTime, seriesDisplayName }: { segments: Segment[]; baseTime: Date; seriesDisplayName: string }) {
  return buildWeekendRoundupSlots({ segments, baseTime, part: 1 }).map((slot) => {
    if (!slot.segment?.riskFlags.includes("weekend_roundup_outro")) return slot;
    const script = `This concludes ConferenceHype Journal Club - ${seriesDisplayName}. Which article could change practice, and which journal should we revisit in greater depth? Share this regional journal review with a colleague or your clinical team, add your perspective in the comments, like the video, and subscribe for the next Journal Club.`;
    return {
      ...slot,
      label: `end of ${seriesDisplayName.toLowerCase()}`,
      segment: {
        ...slot.segment,
        title: `End of Journal Club - ${seriesDisplayName}`,
        summary: script,
        script,
        riskFlags: slot.segment.riskFlags.map((flag) => flag === "weekend_roundup_outro" ? "regional_journal_outro" : flag)
      }
    };
  });
}
