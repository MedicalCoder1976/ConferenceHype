import type {
  DailyCoveragePlan,
  MedicalConference,
  OncologyJournal,
  SourceConfig
} from "@/lib/types";

export function isOngoingConference(conference: MedicalConference, coverageDate: string) {
  return Boolean(
    conference.startDate &&
      conference.endDate &&
      coverageDate >= conference.startDate &&
      coverageDate <= conference.endDate
  );
}

export function createDefaultDailyCoveragePlan({
  coverageDate,
  conferences
}: {
  coverageDate: string;
  conferences: MedicalConference[];
}): DailyCoveragePlan {
  return {
    coverageDate,
    conferenceIds: conferences
      .filter((conference) => isOngoingConference(conference, coverageDate))
      .map((conference) => conference.id),
    journalIds: [],
    sourceIds: [],
    customItems: [],
    priorityTopics: [],
    exclusions: [],
    breakingNewsEnabled: true,
    notes: ""
  };
}

function includesAll(selectedIds: string[], defaultIds: string[]) {
  if (defaultIds.length === 0) {
    return false;
  }
  const selected = new Set(selectedIds);
  return defaultIds.every((id) => selected.has(id));
}

export function normalizeLegacyDailyCoverageDefaults({
  plan,
  journals,
  sources
}: {
  plan: DailyCoveragePlan;
  journals: OncologyJournal[];
  sources: SourceConfig[];
}): DailyCoveragePlan {
  const oldDefaultJournalIds = journals
    .filter((journal) => journal.enabled)
    .map((journal) => journal.id);
  const oldDefaultSourceIds = sources
    .filter(
      (source) =>
        source.enabled &&
        source.type !== "general_social" &&
        source.type !== "manual"
    )
    .map((source) => source.id);

  return {
    ...plan,
    journalIds: includesAll(plan.journalIds, oldDefaultJournalIds)
      ? []
      : plan.journalIds,
    sourceIds: includesAll(plan.sourceIds, oldDefaultSourceIds)
      ? []
      : plan.sourceIds
  };
}
