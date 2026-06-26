import { loadEnvConfig } from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { isAbstractSourceId } from "@/lib/sources/socialLinks";
import type { IngestedItem, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";
import type { TopicSearchEntity } from "@/lib/sources/x";

loadEnvConfig(process.cwd());

let getMedicalConferencesFromDb: any;
let getOncologyJournalsFromDb: any;
let getPendingSegmentsFromDb: any;
let getSourcesFromDb: any;
let saveGeneratedSegmentsToDb: any;
let upsertAdminCatalogSeedsToDb: any;
let getPersona: any;
let buildBatchSegment: any;
let buildPubMedBackedJournalItem: any;
let itemMatchesSelections: any;
let personaIdForBatchIndex: any;
let runIngestionJob: any;
let sourceRegistry: SourceConfig[];
let buildAllCatalogCoveragePlan: any;
let markWeeklySourceSegment: any;
let weeklySourceWeekKey: any;
let WEEKLY_SOURCE_POOL_FLAG: string;
let searchTopicFallback: (entities: TopicSearchEntity[]) => Promise<Map<string, IngestedItem>>;

async function loadDependencies() {
  const db = await import("@/lib/db");
  getMedicalConferencesFromDb = db.getMedicalConferencesFromDb;
  getOncologyJournalsFromDb = db.getOncologyJournalsFromDb;
  getPendingSegmentsFromDb = db.getPendingSegmentsFromDb;
  getSourcesFromDb = db.getSourcesFromDb;
  saveGeneratedSegmentsToDb = db.saveGeneratedSegmentsToDb;
  upsertAdminCatalogSeedsToDb = db.upsertAdminCatalogSeedsToDb;
  ({ getPersona } = await import("@/lib/generation/personas"));
  ({
    buildBatchSegment,
    buildPubMedBackedJournalItem,
    itemMatchesSelections,
    personaIdForBatchIndex
  } = await import("@/lib/intakeCards"));
  ({ runIngestionJob } = await import("@/lib/jobs/ingest"));
  ({ sourceRegistry } = await import("@/lib/sources/registry"));
  ({
    buildAllCatalogCoveragePlan,
    markWeeklySourceSegment,
    weeklySourceWeekKey,
    WEEKLY_SOURCE_POOL_FLAG
  } = await import("@/lib/weeklySourceCards"));
  ({ searchTopicFallback } = await import("@/lib/sources/x"));
}

function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function stableKey(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function sourceUrlFlag(item: IngestedItem) {
  return `source_url:${stableKey(`${item.url}|${item.title}`.toLowerCase())}`;
}

function existingWeeklyKeys(segments: Segment[], weekKey: string) {
  return new Set(
    segments
      .filter(
        (segment) =>
          segment.riskFlags.includes(WEEKLY_SOURCE_POOL_FLAG) &&
          segment.riskFlags.includes(`weekly_key:${weekKey}`)
      )
      .flatMap((segment) => segment.riskFlags.filter((flag) => flag.startsWith("source_url:")))
  );
}

function contextContentType(sourceType: IngestedItem["sourceType"]) {
  if (sourceType === "official") return "agenda_preview" as const;
  if (sourceType === "company") return "industry_floor" as const;
  if (sourceType.includes("social")) return "social_signal" as const;
  return "media_roundup" as const;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function naturalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// Spoken-language date range — "June 11 through 14, 2026" rather than the
// raw ISO strings a news reader would never actually say aloud.
function naturalConferenceDateRange(conference: MedicalConference) {
  if (conference.startDate && conference.endDate) {
    if (conference.startDate === conference.endDate) {
      return naturalDate(conference.startDate);
    }
    const [startYear, startMonth, startDay] = conference.startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = conference.endDate.split("-").map(Number);
    if (startYear === endYear && startMonth === endMonth) {
      return `${MONTH_NAMES[startMonth - 1]} ${startDay} through ${endDay}, ${startYear}`;
    }
    return `${naturalDate(conference.startDate)} through ${naturalDate(conference.endDate)}`;
  }
  if (conference.startDate) {
    return naturalDate(conference.startDate);
  }
  if (conference.month && conference.year) {
    return `${MONTH_NAMES[conference.month - 1]} ${conference.year}`;
  }
  return "";
}

// Builds the actual Segment shell shared by every fallback announcement
// type below — only the spoken content differs per entity type.
function finalizeAnnouncementSegment({
  sourceId,
  sourceUrl,
  sourceType,
  weekKey,
  index,
  title,
  summary,
  script,
  citationLabel
}: {
  sourceId: string;
  sourceUrl: string;
  sourceType: IngestedItem["sourceType"];
  weekKey: string;
  index: number;
  title: string;
  summary: string;
  script: string;
  citationLabel: string;
}): Segment {
  const persona = getPersona(personaIdForBatchIndex(index));
  const createdAt = new Date().toISOString();
  return markWeeklySourceSegment(
    {
      id: `weekly-context-${randomUUID()}`,
      title,
      summary,
      script,
      contentType: contextContentType(sourceType),
      personaId: persona.id,
      personaName: persona.name,
      hypeLevel: "standard",
      language: "English",
      status: "pending_review",
      citations: [{ label: citationLabel, url: sourceUrl, sourceType }],
      socialBuzzItems: [],
      riskFlags: [
        "weekly_source_context",
        `source_id:${sourceId}`,
        `source_url:${stableKey(`${sourceUrl}|${title}`.toLowerCase())}`
      ],
      confidenceScore: 70,
      createdAt,
      updatedAt: createdAt
    },
    weekKey
  );
}

// Real, fact-grounded, naturally-spoken content using only verified
// conference metadata (name, dates, location, specialty) — no fabricated
// claims about sessions or news that hasn't actually been published yet.
function buildConferenceAnnouncementSegment(
  conference: MedicalConference,
  weekKey: string,
  index: number
): Segment {
  const dateRange = naturalConferenceDateRange(conference);
  const location = [conference.city, conference.country].filter(Boolean).join(", ");
  const specialty = conference.specialties.length ? conference.specialties.join(" and ") : "medicine";
  const acronym = conference.acronym ? ` (${conference.acronym})` : "";
  const whenWhereSpoken = [dateRange ? `for ${dateRange}` : "", location ? `in ${location}` : ""]
    .filter(Boolean)
    .join(", ");
  const whenWherePlain = [dateRange, location].filter(Boolean).join(", ");

  const script = [
    `${conference.name}${acronym} is on the calendar${whenWhereSpoken ? ` ${whenWhereSpoken}` : ""}.`,
    `It is a meeting for the ${specialty} community, bringing clinicians and researchers together for sessions and presentations in the field.`,
    "No fresh official program updates or attributed coverage came through this week, so there is nothing new to summarize yet.",
    "ConferenceHype will keep tracking the official program, abstracts, and media coverage as they are published, and bring a source-attributed read as soon as there is something to report."
  ].join(" ");

  const summary = `${conference.name}${acronym} coverage preview${whenWherePlain ? `: ${whenWherePlain}` : ""}. No new official or attributed source material yet this week.`;

  return finalizeAnnouncementSegment({
    sourceId: conference.id,
    sourceUrl: conference.officialUrl,
    sourceType: "official",
    weekKey,
    index,
    title: `Weekly update: ${conference.name}`,
    summary,
    script,
    citationLabel: conference.name
  });
}

function buildJournalAnnouncementSegment(
  journal: OncologyJournal,
  weekKey: string,
  index: number
): Segment {
  const abbreviation = journal.abbreviation ? ` (${journal.abbreviation})` : "";
  const script = [
    `${journal.name}${abbreviation} is one of the journals ConferenceHype tracks for oncology and hematology coverage.`,
    "No new articles came through this journal's feed this week, so there is nothing fresh to summarize yet.",
    "ConferenceHype will pick up the next published issue as soon as it is available and bring a source-attributed read of what is in it."
  ].join(" ");
  const summary = `${journal.name}${abbreviation}: no new tracked articles this week.`;
  return finalizeAnnouncementSegment({
    sourceId: `daily-journal-${journal.id}`,
    sourceUrl: journal.officialUrl || journal.rssUrl,
    sourceType: "official",
    weekKey,
    index,
    title: `Weekly update: ${journal.name}`,
    summary,
    script,
    citationLabel: journal.name
  });
}

function buildSourceAnnouncementSegment(
  source: SourceConfig,
  weekKey: string,
  index: number
): Segment {
  const script = [
    `${source.name} is one of the clinical news and media sources ConferenceHype monitors.`,
    "No new attributed items came through this source this week, so there is nothing fresh to summarize yet.",
    `ConferenceHype will pick up new coverage from ${source.name} as soon as it is published.`
  ].join(" ");
  const summary = `${source.name}: no new attributed items this week.`;
  return finalizeAnnouncementSegment({
    sourceId: source.id,
    sourceUrl: source.url,
    sourceType: source.type,
    weekKey,
    index,
    title: `Weekly update: ${source.name}`,
    summary,
    script,
    citationLabel: source.name
  });
}

function sourceMatches(
  item: IngestedItem,
  selection: {
    conferences?: MedicalConference[];
    journals?: OncologyJournal[];
    sourceIds?: string[];
  }
) {
  return itemMatchesSelections({
    item,
    conferences: selection.conferences ?? [],
    journals: selection.journals ?? [],
    sourceIds: selection.sourceIds ?? []
  });
}

function pickItemsForSource(
  items: IngestedItem[],
  selection: {
    conferences?: MedicalConference[];
    journals?: OncologyJournal[];
    sourceIds?: string[];
  },
  limit: number
) {
  const seen = new Set<string>();
  return items
    .filter((item) => sourceMatches(item, selection))
    .filter((item) => {
      const key = `${item.url}|${item.title}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const rankDelta = a.rank - b.rank;
      if (rankDelta !== 0) return rankDelta;
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    })
    .slice(0, limit);
}

// Enforces the weekly sequence: official-page items, then abstract-library
// items, then — last — at most one social-voice item. Reserves a slot for
// the social card whenever one is available instead of letting it compete
// on rank with official/abstract items and lose out.
function orderedPickForEntity(
  items: IngestedItem[],
  selection: {
    conferences?: MedicalConference[];
    journals?: OncologyJournal[];
    sourceIds?: string[];
  },
  cardsPerSource: number
) {
  const matched = pickItemsForSource(items, selection, cardsPerSource * 4);
  const social = matched.filter((item) => item.sourceType === "general_social");
  const nonSocial = matched.filter((item) => item.sourceType !== "general_social");
  const official = nonSocial.filter((item) => !isAbstractSourceId(item.sourceId));
  const abstracts = nonSocial.filter((item) => isAbstractSourceId(item.sourceId));
  const socialPick = social.slice(0, 1);
  const contentBudget = Math.max(cardsPerSource - socialPick.length, 0);
  return [...official, ...abstracts].slice(0, contentBudget).concat(socialPick);
}

async function buildSegmentsForItems({
  items,
  weekKey,
  existingKeys,
  startIndex
}: {
  items: IngestedItem[];
  weekKey: string;
  existingKeys: Set<string>;
  startIndex: number;
}) {
  const segments: Segment[] = [];
  for (const item of items) {
    const urlFlag = sourceUrlFlag(item);
    if (existingKeys.has(urlFlag)) {
      continue;
    }
    const enriched = await buildPubMedBackedJournalItem(item);
    if (!enriched) {
      continue;
    }
    const segment = markWeeklySourceSegment(
      buildBatchSegment(enriched, personaIdForBatchIndex(startIndex + segments.length), {
        batchLabel: `Weekly update ${weekKey}`
      }),
      weekKey
    );
    segments.push({
      ...segment,
      riskFlags: Array.from(new Set([...segment.riskFlags, urlFlag]))
    });
    existingKeys.add(urlFlag);
  }
  return segments;
}

function addContextIfEmpty({
  generated,
  built,
  existingKeys,
  title,
  sourceUrl,
  buildFallback
}: {
  generated: Segment[];
  built: Segment[];
  existingKeys: Set<string>;
  title: string;
  sourceUrl: string;
  buildFallback: (index: number) => Segment;
}) {
  if (built.length > 0) {
    generated.push(...built);
    return;
  }
  const key = `source_url:${stableKey(`${sourceUrl}|${title}`.toLowerCase())}`;
  if (existingKeys.has(key)) {
    return;
  }
  const context = buildFallback(generated.length);
  generated.push(context);
  existingKeys.add(key);
}

async function main() {
  await loadDependencies();
  await upsertAdminCatalogSeedsToDb();
  const [conferences, journals, sources, pendingSegments] = await Promise.all([
    getMedicalConferencesFromDb(),
    getOncologyJournalsFromDb(),
    getSourcesFromDb(),
    getPendingSegmentsFromDb(2000)
  ]);
  const enabledConferences = ((conferences ?? []) as MedicalConference[]).filter((conference) => conference.enabled);
  const enabledJournals = ((journals ?? []) as OncologyJournal[]).filter((journal) => journal.enabled);
  const enabledSources = ((sources ?? sourceRegistry) as SourceConfig[]).filter(
    (source) => source.enabled && source.type !== "general_social" && source.type !== "manual"
  );
  const coverageDate = process.env.WEEKLY_SOURCE_COVERAGE_DATE ?? easternDate();
  const weekKey = process.env.WEEKLY_SOURCE_WEEK_KEY ?? weeklySourceWeekKey();
  const cardsPerSource = Math.max(
    1,
    Math.min(Number(process.env.WEEKLY_SOURCE_CARDS_PER_SOURCE ?? 2), 6)
  );
  // Journals get a richer weekly card budget than conferences/newspapers —
  // one structured (Background/Methods/Results/Discussion) template card per
  // article in that week's RSS edition, still with zero LLM calls.
  const journalCardsPerSource = Math.max(
    1,
    Math.min(Number(process.env.WEEKLY_JOURNAL_CARDS_PER_SOURCE ?? 12), 20)
  );
  const plan = buildAllCatalogCoveragePlan({
    coverageDate,
    conferences: enabledConferences,
    journals: enabledJournals,
    sources: enabledSources
  });
  const items = await runIngestionJob(coverageDate, plan);
  const existingKeys = existingWeeklyKeys(pendingSegments ?? [], weekKey);
  const generated: Segment[] = [];

  // Pre-pass: figure out which entities have no real official/abstract/RSS
  // items this week, and for only those, search X once (batched) for either
  // the entity's own posts or the highest-engagement real post from whoever
  // is actually discussing it. Run before the per-entity loops below so all
  // three entity types share the same batched search calls instead of each
  // hitting the API separately.
  const conferenceSelections = enabledConferences.map((conference) => ({
    conference,
    selected: orderedPickForEntity(items, { conferences: [conference] }, cardsPerSource)
  }));
  const journalSelections = enabledJournals.map((journal) => ({
    journal,
    selected: orderedPickForEntity(items, { journals: [journal] }, journalCardsPerSource)
  }));
  const sourceSelections = enabledSources.map((source) => ({
    source,
    selected: orderedPickForEntity(items, { sourceIds: [source.id] }, cardsPerSource)
  }));

  const topicSearchEntities: TopicSearchEntity[] = [
    ...conferenceSelections
      .filter(({ selected }) => selected.length === 0)
      .map(({ conference }) => ({
        sourceId: conference.id,
        name: conference.name,
        acronym: conference.acronym
      })),
    ...journalSelections
      .filter(({ selected }) => selected.length === 0)
      .map(({ journal }) => ({
        sourceId: `daily-journal-${journal.id}`,
        name: journal.name,
        acronym: journal.abbreviation
      })),
    ...sourceSelections
      .filter(({ selected }) => selected.length === 0)
      .map(({ source }) => ({ sourceId: source.id, name: source.name }))
  ];
  const topicFallback = await searchTopicFallback(topicSearchEntities);

  for (const { conference, selected } of conferenceSelections) {
    const socialFallback = selected.length === 0 ? topicFallback.get(conference.id) : undefined;
    const built = await buildSegmentsForItems({
      items: selected.length ? selected : socialFallback ? [socialFallback] : [],
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      title: `Weekly update: ${conference.name}`,
      sourceUrl: conference.officialUrl,
      buildFallback: (index) => buildConferenceAnnouncementSegment(conference, weekKey, index)
    });
  }

  for (const { journal, selected } of journalSelections) {
    const socialFallback =
      selected.length === 0 ? topicFallback.get(`daily-journal-${journal.id}`) : undefined;
    const built = await buildSegmentsForItems({
      items: selected.length ? selected : socialFallback ? [socialFallback] : [],
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      title: `Weekly update: ${journal.name}`,
      sourceUrl: journal.officialUrl || journal.rssUrl,
      buildFallback: (index) => buildJournalAnnouncementSegment(journal, weekKey, index)
    });
  }

  for (const { source, selected } of sourceSelections) {
    const socialFallback = selected.length === 0 ? topicFallback.get(source.id) : undefined;
    const built = await buildSegmentsForItems({
      items: selected.length ? selected : socialFallback ? [socialFallback] : [],
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      title: `Weekly update: ${source.name}`,
      sourceUrl: source.url,
      buildFallback: (index) => buildSourceAnnouncementSegment(source, weekKey, index)
    });
  }

  const saved = (await saveGeneratedSegmentsToDb(generated)) ?? generated;
  console.log(
    JSON.stringify({
      ok: true,
      coverageDate,
      weekKey,
      cardsPerSource,
      journalCardsPerSource,
      sources: {
        conferences: enabledConferences.length,
        journals: enabledJournals.length,
        newspapers: enabledSources.length
      },
      topicSearchAttempted: topicSearchEntities.length,
      topicSearchMatched: topicFallback.size,
      generated: saved.length
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
