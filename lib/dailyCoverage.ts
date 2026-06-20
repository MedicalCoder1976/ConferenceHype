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
  coverageDate
}: {
  coverageDate: string;
  conferences: MedicalConference[];
}): DailyCoveragePlan {
  return {
    coverageDate,
    conferenceIds: [],
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
  if (defaultIds.length <= 1) {
    return false;
  }
  const selected = new Set(selectedIds);
  return defaultIds.every((id) => selected.has(id));
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function normalizeLegacyDailyCoverageDefaults({
  plan,
  journals,
  conferences = [],
  sources,
  clearLegacyDefaults = true
}: {
  plan: DailyCoveragePlan;
  journals: OncologyJournal[];
  conferences?: MedicalConference[];
  sources: SourceConfig[];
  clearLegacyDefaults?: boolean;
}): DailyCoveragePlan {
  const oldDefaultJournalIds = journals
    .filter((journal) => journal.enabled)
    .map((journal) => journal.id);
  const oldDefaultConferenceIds = conferences
    .filter((conference) => conference.enabled)
    .map((conference) => conference.id);
  const oldDefaultSourceIds = sources
    .filter(
      (source) =>
        source.enabled &&
        source.type !== "general_social" &&
        source.type !== "manual"
    )
    .map((source) => source.id);
  const knownJournalIds = new Set(journals.map((journal) => journal.id));
  const knownConferenceIds = new Set(conferences.map((conference) => conference.id));
  const knownSourceIds = new Set(sources.map((source) => source.id));
  const journalIdsFromSyntheticSources = plan.sourceIds
    .map((id) => id.match(/^daily-journal-(.+)$/)?.[1])
    .filter((id): id is string => Boolean(id && knownJournalIds.has(id)));
  const conferenceIdsFromSyntheticSources = plan.sourceIds
    .map((id) => id.match(/^daily-conference-(.+)$/)?.[1])
    .filter((id): id is string => Boolean(id && knownConferenceIds.has(id)));
  const sourceIdsWithoutSynthetic = plan.sourceIds.filter(
    (id) =>
      !id.startsWith("daily-journal-") &&
      !id.startsWith("daily-conference-") &&
      !id.startsWith("daily-custom-") &&
      knownSourceIds.has(id)
  );
  const normalizedJournalIds = uniqueIds([...plan.journalIds, ...journalIdsFromSyntheticSources]);
  const normalizedConferenceIds = uniqueIds([
    ...plan.conferenceIds,
    ...conferenceIdsFromSyntheticSources
  ]);
  const normalizedSourceIds = uniqueIds(sourceIdsWithoutSynthetic);
  const staleDefaultOnlyJournalIds = normalizedJournalIds.filter((id) =>
    oldDefaultJournalIds.includes(id)
  );
  const staleDefaultOnlyConferenceIds = normalizedConferenceIds.filter((id) =>
    oldDefaultConferenceIds.includes(id)
  );
  const staleDefaultOnlySourceIds = normalizedSourceIds.filter((id) =>
    oldDefaultSourceIds.includes(id)
  );
  const shouldClearLegacyDefaults = clearLegacyDefaults;

  return {
    ...plan,
    conferenceIds: shouldClearLegacyDefaults &&
      (includesAll(normalizedConferenceIds, oldDefaultConferenceIds) ||
        staleDefaultOnlyConferenceIds.length === normalizedConferenceIds.length)
      ? []
      : normalizedConferenceIds,
    journalIds: shouldClearLegacyDefaults &&
      (includesAll(normalizedJournalIds, oldDefaultJournalIds) ||
        staleDefaultOnlyJournalIds.length === normalizedJournalIds.length)
      ? []
      : normalizedJournalIds,
    sourceIds: shouldClearLegacyDefaults &&
      (includesAll(normalizedSourceIds, oldDefaultSourceIds) ||
        staleDefaultOnlySourceIds.length === normalizedSourceIds.length)
      ? []
      : normalizedSourceIds
  };
}
