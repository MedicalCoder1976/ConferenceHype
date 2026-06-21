import {
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getPendingSegmentsFromDb,
  getSourcesFromDb,
  upsertAdminCatalogSeedsToDb
} from "@/lib/db";
import { sourceRegistry } from "@/lib/sources/registry";
import { createHash } from "node:crypto";
import {
  sourceIdsFromSegment,
  weeklySourceWeekKey,
  WEEKLY_SOURCE_POOL_FLAG
} from "@/lib/weeklySourceCards";
import type { Segment, SourceConfig } from "@/lib/types";

type RequiredSource = {
  kind: "conference" | "journal" | "newspaper";
  id: string;
  label: string;
  aliases: string[];
};

function stableKey(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function sourceUrlAlias(sourceUrl: string, sourceName: string) {
  return `source_url:${stableKey(`${sourceUrl}|Weekly update: ${sourceName}`.toLowerCase())}`;
}

function enabledNewspaperSources(sources: SourceConfig[]) {
  return sources.filter(
    (source) => source.enabled && source.type !== "general_social" && source.type !== "manual"
  );
}

function segmentHasAlias(segment: Segment, aliases: string[], weekKey: string) {
  if (segment.status !== "pending_review") return false;
  if (!segment.riskFlags.includes(WEEKLY_SOURCE_POOL_FLAG)) return false;
  if (!segment.riskFlags.includes(`weekly_key:${weekKey}`)) return false;
  const sourceIds = sourceIdsFromSegment(segment);
  return aliases.some((alias) => sourceIds.includes(alias) || segment.riskFlags.includes(alias));
}

async function main() {
  await upsertAdminCatalogSeedsToDb();
  const [conferences, journals, sources, pendingSegments] = await Promise.all([
    getMedicalConferencesFromDb(),
    getOncologyJournalsFromDb(),
    getSourcesFromDb(),
    getPendingSegmentsFromDb(5000)
  ]);
  const required: RequiredSource[] = [
    ...((conferences ?? [])
      .filter((conference) => conference.enabled)
      .map((conference) => ({
        kind: "conference" as const,
        id: conference.id,
        label: conference.name,
        aliases: [
          conference.id,
          `daily-conference-${conference.id}`,
          `daily-conference-${conference.id}-context`,
          sourceUrlAlias(conference.officialUrl, conference.name)
        ]
      }))),
    ...((journals ?? [])
      .filter((journal) => journal.enabled)
      .map((journal) => ({
        kind: "journal" as const,
        id: journal.id,
        label: journal.name,
        aliases: [
          journal.id,
          `daily-journal-${journal.id}`,
          sourceUrlAlias(journal.officialUrl || journal.rssUrl, journal.name)
        ]
      }))),
    ...enabledNewspaperSources(((sources ?? sourceRegistry) as SourceConfig[])).map((source) => ({
      kind: "newspaper" as const,
      id: source.id,
      label: source.name,
      aliases: [source.id, sourceUrlAlias(source.url, source.name)]
    }))
  ];
  const weekKey = process.env.WEEKLY_SOURCE_WEEK_KEY ?? weeklySourceWeekKey();
  const segments = pendingSegments ?? [];
  const missing = required.filter(
    (source) => !segments.some((segment) => segmentHasAlias(segment, source.aliases, weekKey))
  );

  console.log(
    JSON.stringify({
      ok: missing.length === 0,
      weekKey,
      required: required.length,
      available: required.length - missing.length,
      missing
    })
  );

  if (missing.length > 0) {
    throw new Error(
      `Weekly source card verification failed: ${missing.length} enabled source(s) have no unused weekly ready card.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

