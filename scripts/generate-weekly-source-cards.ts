import { loadEnvConfig } from "@next/env";
import type { IngestedItem, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";
import type * as WeeklyCardGeneration from "@/lib/weeklySourceCardGeneration";
import type { TopicSearchEntity } from "@/lib/sources/x";

loadEnvConfig(process.cwd());

let getMedicalConferencesFromDb: any;
let getOncologyJournalsFromDb: any;
let getPendingSegmentsFromDb: any;
let getSourcesFromDb: any;
let saveGeneratedSegmentsToDb: any;
let upsertAdminCatalogSeedsToDb: any;
let runIngestionJob: any;
let sourceRegistry: SourceConfig[];
let buildAllCatalogCoveragePlan: any;
let weeklySourceWeekKey: any;
let WEEKLY_SOURCE_POOL_FLAG: string;
let searchTopicFallback: (entities: TopicSearchEntity[]) => Promise<Map<string, IngestedItem>>;
let fetchPubMedArticlesForJournal: typeof import("@/lib/sources/pubmed").fetchPubMedArticlesForJournal;
let pubmedArticlesToIngestedItems: typeof import("@/lib/sources/pubmed").pubmedArticlesToIngestedItems;
let entitySelection: typeof WeeklyCardGeneration.entitySelection;
let existingWeeklyKeys: typeof WeeklyCardGeneration.existingWeeklyKeys;
let dedupeAgainstFreshSegments: typeof WeeklyCardGeneration.dedupeAgainstFreshSegments;
let generateWeeklyCardsForEntities: typeof WeeklyCardGeneration.generateWeeklyCardsForEntities;
let orderedPickForEntity: typeof WeeklyCardGeneration.orderedPickForEntity;
let topicSearchEntityFor: typeof WeeklyCardGeneration.topicSearchEntityFor;
type WeeklyCardEntity = WeeklyCardGeneration.WeeklyCardEntity;

async function loadDependencies() {
  const db = await import("@/lib/db");
  getMedicalConferencesFromDb = db.getMedicalConferencesFromDb;
  getOncologyJournalsFromDb = db.getOncologyJournalsFromDb;
  getPendingSegmentsFromDb = db.getPendingSegmentsFromDb;
  getSourcesFromDb = db.getSourcesFromDb;
  saveGeneratedSegmentsToDb = db.saveGeneratedSegmentsToDb;
  upsertAdminCatalogSeedsToDb = db.upsertAdminCatalogSeedsToDb;
  ({ runIngestionJob } = await import("@/lib/jobs/ingest"));
  ({ sourceRegistry } = await import("@/lib/sources/registry"));
  ({ buildAllCatalogCoveragePlan, weeklySourceWeekKey, WEEKLY_SOURCE_POOL_FLAG } = await import(
    "@/lib/weeklySourceCards"
  ));
  ({ searchTopicFallback } = await import("@/lib/sources/x"));
  ({ fetchPubMedArticlesForJournal, pubmedArticlesToIngestedItems } = await import(
    "@/lib/sources/pubmed"
  ));
  ({
    entitySelection,
    existingWeeklyKeys,
    dedupeAgainstFreshSegments,
    generateWeeklyCardsForEntities,
    orderedPickForEntity,
    topicSearchEntityFor
  } = await import("@/lib/weeklySourceCardGeneration"));
}

function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
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
  const scope = process.env.WEEKLY_SOURCE_SCOPE ?? "all";
  const enabledConferences =
    scope === "all" || scope === "conferences"
      ? ((conferences ?? []) as MedicalConference[]).filter((conference) => conference.enabled)
      : [];
  const enabledJournals =
    scope === "all" || scope === "journals"
      ? ((journals ?? []) as OncologyJournal[]).filter((journal) => journal.enabled)
      : [];
  const enabledSources =
    scope === "all" || scope === "newspapers"
      ? ((sources ?? sourceRegistry) as SourceConfig[]).filter(
          (source) => source.enabled && source.type !== "general_social" && source.type !== "manual"
        )
      : [];
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
  const items: IngestedItem[] = await runIngestionJob(coverageDate, plan);
  const existingKeys = existingWeeklyKeys(pendingSegments ?? [], weekKey, WEEKLY_SOURCE_POOL_FLAG);

  const entities: WeeklyCardEntity[] = [
    ...enabledConferences.map((conference) => ({ type: "conference" as const, conference })),
    ...enabledJournals.map((journal) => ({ type: "journal" as const, journal })),
    ...enabledSources.map((source) => ({ type: "source" as const, source }))
  ];
  const cardsPerSourceFor = (entity: WeeklyCardEntity) =>
    entity.type === "journal" ? journalCardsPerSource : cardsPerSource;

  // Journals with nothing new this week (RSS itself may have succeeded but
  // returned only already-carded items -- lib/jobs/ingest.ts's own PubMed
  // fallback only covers an outright RSS failure) get one more direct PubMed
  // [Journal] search before anything falls back to X. PubMed is a more
  // authoritative, on-topic source for medical journal content than a
  // generic social search, so it must be tried first, not after.
  let pubMedRescued = 0;
  for (const entity of entities) {
    if (entity.type !== "journal") continue;
    const hasItems =
      orderedPickForEntity(items, entitySelection(entity), cardsPerSourceFor(entity)).length > 0;
    if (hasItems) continue;
    const articles = await fetchPubMedArticlesForJournal(entity.journal.name);
    if (articles.length === 0) continue;
    items.push(
      ...pubmedArticlesToIngestedItems(articles, {
        sourceId: entity.journal.id,
        sourceName: entity.journal.name,
        sourceType: "official",
        rank: 1
      })
    );
    pubMedRescued += 1;
  }

  // Figure out which entities still have no real official/abstract/RSS/
  // PubMed items this week, and for only those, search X once (batched) for
  // either the entity's own posts or the highest-engagement real post from
  // whoever is actually discussing it — before generating any cards, so all
  // three entity types share the same batched search calls.
  const topicSearchEntities: TopicSearchEntity[] = entities
    .filter(
      (entity) =>
        orderedPickForEntity(items, entitySelection(entity), cardsPerSourceFor(entity)).length === 0
    )
    .map(topicSearchEntityFor);
  const topicFallback = await searchTopicFallback(topicSearchEntities);

  const generated = await generateWeeklyCardsForEntities({
    entities,
    items,
    weekKey,
    existingKeys,
    cardsPerSourceFor,
    topicFallback
  });

  const freshPendingSegments = (await getPendingSegmentsFromDb(2000)) ?? [];
  const deduped = dedupeAgainstFreshSegments(generated, freshPendingSegments, weekKey, WEEKLY_SOURCE_POOL_FLAG);
  const saved: Segment[] = (await saveGeneratedSegmentsToDb(deduped)) ?? deduped;
  console.log(
    JSON.stringify({
      ok: true,
      coverageDate,
      weekKey,
      scope,
      cardsPerSource,
      journalCardsPerSource,
      sources: {
        conferences: enabledConferences.length,
        journals: enabledJournals.length,
        newspapers: enabledSources.length
      },
      pubMedRescued,
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
