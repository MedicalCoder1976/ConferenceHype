import { loadEnvConfig } from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import type { IngestedItem, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";

loadEnvConfig(process.cwd());

let getMedicalConferencesFromDb: any;
let getOncologyJournalsFromDb: any;
let getPendingSegmentsFromDb: any;
let getSourcesFromDb: any;
let saveGeneratedSegmentsToDb: any;
let upsertAdminCatalogSeedsToDb: any;
let getPersona: any;
let buildBatchSegment: any;
let buildConferenceContextItem: any;
let buildPubMedBackedJournalItem: any;
let itemMatchesSelections: any;
let personaIdForBatchIndex: any;
let runIngestionJob: any;
let sourceRegistry: SourceConfig[];
let buildAllCatalogCoveragePlan: any;
let markWeeklySourceSegment: any;
let weeklySourceWeekKey: any;
let WEEKLY_SOURCE_POOL_FLAG: string;

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
    buildConferenceContextItem,
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

function buildWeeklyContextSegment({
  sourceId,
  sourceName,
  sourceUrl,
  sourceType,
  weekKey,
  index
}: {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: IngestedItem["sourceType"];
  weekKey: string;
  index: number;
}): Segment {
  const persona = getPersona(personaIdForBatchIndex(index));
  const createdAt = new Date().toISOString();
  const title = `Weekly update: ${sourceName}`;
  const summary = `${sourceName} coverage context. The official source page identifies the publication, meeting, or news source for this update.`;
  const script = `${persona.name} is covering ${sourceName}. This update is anchored to the official source page for ${sourceName}.`;
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
      citations: [{ label: sourceName, url: sourceUrl, sourceType }],
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
  weekKey,
  sourceId,
  sourceName,
  sourceUrl,
  sourceType
}: {
  generated: Segment[];
  built: Segment[];
  existingKeys: Set<string>;
  weekKey: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: IngestedItem["sourceType"];
}) {
  if (built.length > 0) {
    generated.push(...built);
    return;
  }
  const title = `Weekly update: ${sourceName}`;
  const key = `source_url:${stableKey(`${sourceUrl}|${title}`.toLowerCase())}`;
  if (existingKeys.has(key)) {
    return;
  }
  const context = buildWeeklyContextSegment({
    sourceId,
    sourceName,
    sourceUrl,
    sourceType,
    weekKey,
    index: generated.length
  });
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
  const plan = buildAllCatalogCoveragePlan({
    coverageDate,
    conferences: enabledConferences,
    journals: enabledJournals,
    sources: enabledSources
  });
  const items = await runIngestionJob(coverageDate, plan);
  const existingKeys = existingWeeklyKeys(pendingSegments ?? [], weekKey);
  const generated: Segment[] = [];

  for (const conference of enabledConferences) {
    const selected = pickItemsForSource(items, { conferences: [conference] }, cardsPerSource);
    const fallbackItems = selected.length ? selected : [buildConferenceContextItem(conference)];
    const built = await buildSegmentsForItems({
      items: fallbackItems,
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      weekKey,
      sourceId: conference.id,
      sourceName: conference.name,
      sourceUrl: conference.officialUrl,
      sourceType: "official"
    });
  }

  for (const journal of enabledJournals) {
    const built = await buildSegmentsForItems({
      items: pickItemsForSource(items, { journals: [journal] }, cardsPerSource),
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      weekKey,
      sourceId: `daily-journal-${journal.id}`,
      sourceName: journal.name,
      sourceUrl: journal.officialUrl || journal.rssUrl,
      sourceType: "official"
    });
  }

  for (const source of enabledSources) {
    const built = await buildSegmentsForItems({
      items: pickItemsForSource(items, { sourceIds: [source.id] }, cardsPerSource),
      weekKey,
      existingKeys,
      startIndex: generated.length
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      weekKey,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      sourceType: source.type
    });
  }

  const saved = (await saveGeneratedSegmentsToDb(generated)) ?? generated;
  console.log(
    JSON.stringify({
      ok: true,
      coverageDate,
      weekKey,
      cardsPerSource,
      sources: {
        conferences: enabledConferences.length,
        journals: enabledJournals.length,
        newspapers: enabledSources.length
      },
      generated: saved.length
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
