import type { DailyCoveragePlan, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";

export const WEEKLY_SOURCE_POOL_FLAG = "weekly_source_card_pool";

export type SourceSelectionSet = {
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sourceIds: string[];
};

export function weeklySourceWeekKey(now = new Date()) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function buildAllCatalogCoveragePlan({
  coverageDate,
  conferences,
  journals,
  sources
}: {
  coverageDate: string;
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sources: SourceConfig[];
}): DailyCoveragePlan {
  // Includes the X/social search trigger ("conferencehype-tags") and sets
  // breakingNewsEnabled so the weekly sweep's single batched X search runs —
  // this is what lets the weekly sequence end with a social card for every
  // conference, journal, and source whose monitored voice posts that week.
  return {
    coverageDate,
    conferenceIds: conferences.filter((conference) => conference.enabled).map((conference) => conference.id),
    journalIds: journals.filter((journal) => journal.enabled).map((journal) => journal.id),
    sourceIds: sources
      .filter((source) => source.enabled && source.type !== "manual")
      .map((source) => source.id),
    customItems: [],
    priorityTopics: [],
    exclusions: [],
    breakingNewsEnabled: true,
    notes: "Weekly low-cost source-card pre-generation."
  };
}

export function sourceIdsFromSegment(segment: Pick<Segment, "riskFlags">) {
  return (segment.riskFlags ?? [])
    .filter((flag) => flag.startsWith("source_id:"))
    .map((flag) => flag.slice("source_id:".length));
}

export function sourceIdMatchesConference(sourceId: string, conference: Pick<MedicalConference, "id">) {
  return sourceId === conference.id || sourceId.startsWith(`daily-conference-${conference.id}`);
}

export function sourceIdMatchesJournal(sourceId: string, journal: Pick<OncologyJournal, "id">) {
  return sourceId === journal.id || sourceId === `daily-journal-${journal.id}`;
}

export function segmentMatchesSourceSelection(
  segment: Pick<Segment, "riskFlags" | "status">,
  selection: SourceSelectionSet
) {
  if (segment.status !== "pending_review") {
    return false;
  }
  const sourceIds = sourceIdsFromSegment(segment);
  if (sourceIds.length === 0) {
    return false;
  }
  return sourceIds.some((sourceId) => sourceIdMatchesSelection(sourceId, selection));
}

function sourceIdMatchesSelection(sourceId: string, selection: SourceSelectionSet) {
  return (
    selection.conferences.some((conference) => sourceIdMatchesConference(sourceId, conference)) ||
    selection.journals.some((journal) => sourceIdMatchesJournal(sourceId, journal)) ||
    selection.sourceIds.includes(sourceId)
  );
}

export function segmentSourceMatchesSelection(
  segment: Pick<Segment, "riskFlags">,
  selection: SourceSelectionSet
) {
  const sourceIds = sourceIdsFromSegment(segment);
  if (sourceIds.length === 0) {
    return false;
  }
  return sourceIds.some((sourceId) => sourceIdMatchesSelection(sourceId, selection));
}

export function sortWeeklyReadySegmentsForSelection(
  segments: Segment[],
  selection: SourceSelectionSet
) {
  const currentWeekKey = weeklySourceWeekKey();
  return segments
    .filter((segment) =>
      segment.riskFlags.includes(WEEKLY_SOURCE_POOL_FLAG) &&
      segmentMatchesSourceSelection(segment, selection)
    )
    .sort((a, b) => {
      const aWeek = a.riskFlags.some((flag) => flag.startsWith("weekly_key:"));
      const bWeek = b.riskFlags.some((flag) => flag.startsWith("weekly_key:"));
      if (aWeek !== bWeek) {
        return aWeek ? -1 : 1;
      }
      // A leftover, never-presented card from a past week (e.g. last week's
      // "no new tracked articles" announcement) must not outrank this week's
      // real content just because it has an earlier createdAt -- without
      // this, a stale fallback card sorts first forever and the real,
      // freshly generated cards never make it into the schedule.
      const aCurrentWeek = a.riskFlags.includes(`weekly_key:${currentWeekKey}`);
      const bCurrentWeek = b.riskFlags.includes(`weekly_key:${currentWeekKey}`);
      if (aCurrentWeek !== bCurrentWeek) {
        return aCurrentWeek ? -1 : 1;
      }
      // Within the same week, prefer real source-backed cards over the
      // generic "no new tracked articles" announcement card.
      const aAnnouncement = a.riskFlags.includes("weekly_source_context");
      const bAnnouncement = b.riskFlags.includes("weekly_source_context");
      if (aAnnouncement !== bAnnouncement) {
        return aAnnouncement ? 1 : -1;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function markWeeklySourceSegment(segment: Segment, weekKey: string): Segment {
  return {
    ...segment,
    title: segment.title.replace(/^Batch pick:/, "Weekly update:"),
    summary: segment.summary.replace(/\bintake\b/gi, "update"),
    script: segment.script.replace(/\bintake\b/gi, "update"),
    riskFlags: Array.from(
      new Set([
        ...segment.riskFlags,
        WEEKLY_SOURCE_POOL_FLAG,
        `weekly_key:${weekKey}`
      ])
    )
  };
}
