import { createHash } from "node:crypto";
import {
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getPendingSegmentsFromDb,
  getSourcesFromDb,
  saveGeneratedSegmentsToDb,
  upsertAdminCatalogSeedsToDb
} from "@/lib/db";
import {
  buildBatchSegment,
  buildConferenceContextItem,
  buildPubMedBackedJournalItem,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { sourceRegistry } from "@/lib/sources/registry";
import {
  buildAllCatalogCoveragePlan,
  markWeeklySourceSegment,
  weeklySourceWeekKey,
  WEEKLY_SOURCE_POOL_FLAG
} from "@/lib/weeklySourceCards";
import type { IngestedItem, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";

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

async function main() {
  await upsertAdminCatalogSeedsToDb();
  const [conferences, journals, sources, pendingSegments] = await Promise.all([
    getMedicalConferencesFromDb(),
    getOncologyJournalsFromDb(),
    getSourcesFromDb(),
    getPendingSegmentsFromDb(2000)
  ]);
  const enabledConferences = (conferences ?? []).filter((conference) => conference.enabled);
  const enabledJournals = (journals ?? []).filter((journal) => journal.enabled);
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
    generated.push(
      ...(await buildSegmentsForItems({
        items: fallbackItems,
        weekKey,
        existingKeys,
        startIndex: generated.length
      }))
    );
  }

  for (const journal of enabledJournals) {
    generated.push(
      ...(await buildSegmentsForItems({
        items: pickItemsForSource(items, { journals: [journal] }, cardsPerSource),
        weekKey,
        existingKeys,
        startIndex: generated.length
      }))
    );
  }

  for (const source of enabledSources) {
    generated.push(
      ...(await buildSegmentsForItems({
        items: pickItemsForSource(items, { sourceIds: [source.id] }, cardsPerSource),
        weekKey,
        existingKeys,
        startIndex: generated.length
      }))
    );
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
