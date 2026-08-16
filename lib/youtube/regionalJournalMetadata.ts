import { buildWeekendRoundupMetadata } from "@/lib/youtube/weekendRoundupMetadata";
import { buildRegionalJournalClubYoutubeTitle } from "@/lib/youtube/clinicalEvidencePackaging";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { BroadcastMetadata } from "@/lib/youtube/broadcastMetadata";
import type { OncologyJournal } from "@/lib/types";

export function buildRegionalJournalMetadata({ hourStart, slots, journalsById, seriesDisplayName, specialties, studySourceTextBySegmentId = new Map<string, string>() }: { hourStart: Date; slots: BroadcastSlot[]; journalsById: Map<string, OncologyJournal>; seriesDisplayName: string; specialties: string[]; studySourceTextBySegmentId?: Map<string, string> }): BroadcastMetadata {
  const contentSlots = slots.filter((slot) => !slot.segment?.riskFlags.includes("regional_journal_outro"));
  const base = buildWeekendRoundupMetadata({ hourStart, slots: contentSlots, journalsById, part: 1, studySourceTextBySegmentId });
  const lines = base.description.split("\n");
  const detailStart = lines.findIndex((line) => line.startsWith("Featured trials and studies:"));
  const title = buildRegionalJournalClubYoutubeTitle(`${base.clinicalTopic}: ${base.thumbnailHook ?? "New Evidence Explained"}`, seriesDisplayName);
  const description = [
    `JOURNAL CLUB - ${seriesDisplayName}`,
    `Relevant specialties: ${specialties.join("; ")}.`,
    `Audience: ${specialties.join("; ")}; Physicians; Advanced Practice Providers (APPs).`,
    ...(detailStart >= 0 ? lines.slice(detailStart) : lines)
  ].join("\n");
  return {
    ...base,
    title,
    description,
    tags: [...new Set([`Journal Club ${seriesDisplayName}`, seriesDisplayName, ...base.tags])],
    relevantSpecialties: specialties,
    journalClubSeriesLabel: seriesDisplayName
  };
}

export function assertRegionalJournalMetadata(metadata: BroadcastMetadata) {
  if (!metadata.journalClubSeriesLabel) throw new Error("Regional Journal Club series label is missing.");
  if (!metadata.title.startsWith(`JOURNAL CLUB | ${metadata.journalClubSeriesLabel} |`)) throw new Error("Regional Journal Club title has the wrong series prefix.");
  if (!metadata.description.startsWith(`JOURNAL CLUB - ${metadata.journalClubSeriesLabel}\nRelevant specialties:`)) throw new Error("Regional Journal Club description must begin with its series and specialties.");
  if (!metadata.relevantSpecialties?.length) throw new Error("Regional Journal Club must resolve specialties.");
  return metadata;
}
