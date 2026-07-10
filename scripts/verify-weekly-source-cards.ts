import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import type { Segment, SourceConfig } from "@/lib/types";

loadEnvConfig(process.cwd());

let getMedicalConferencesFromDb: any;
let getOncologyJournalsFromDb: any;
let getPendingSegmentsFromDb: any;
let getSourcesFromDb: any;
let upsertAdminCatalogSeedsToDb: any;
let sourceRegistry: SourceConfig[];
let sourceIdsFromSegment: any;
let weeklySourceWeekKey: any;
let WEEKLY_SOURCE_POOL_FLAG: string;

async function loadDependencies() {
  const db = await import("@/lib/db");
  getMedicalConferencesFromDb = db.getMedicalConferencesFromDb;
  getOncologyJournalsFromDb = db.getOncologyJournalsFromDb;
  getPendingSegmentsFromDb = db.getPendingSegmentsFromDb;
  getSourcesFromDb = db.getSourcesFromDb;
  upsertAdminCatalogSeedsToDb = db.upsertAdminCatalogSeedsToDb;
  ({ sourceRegistry } = await import("@/lib/sources/registry"));
  ({
    sourceIdsFromSegment,
    weeklySourceWeekKey,
    WEEKLY_SOURCE_POOL_FLAG
  } = await import("@/lib/weeklySourceCards"));
}

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
  await loadDependencies();
  await upsertAdminCatalogSeedsToDb();
  const [conferences, journals, sources, pendingSegments] = await Promise.all([
    getMedicalConferencesFromDb(),
    getOncologyJournalsFromDb(),
    getSourcesFromDb(),
    getPendingSegmentsFromDb(5000)
  ]);
  const scope = process.env.WEEKLY_SOURCE_SCOPE ?? "all";
  const required: RequiredSource[] = [
    ...(scope === "all" || scope === "conferences"
      ? ((conferences ?? []) as Array<{ id: string; name: string; enabled: boolean; officialUrl: string }>)
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
          }))
      : []),
    ...(scope === "all" || scope === "journals"
      ? ((journals ?? []) as Array<{ id: string; name: string; enabled: boolean; officialUrl: string; rssUrl: string }>)
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
          }))
      : []),
    ...(scope === "all" || scope === "newspapers"
      ? enabledNewspaperSources(((sources ?? sourceRegistry) as SourceConfig[])).map((source) => ({
          kind: "newspaper" as const,
          id: source.id,
          label: source.name,
          aliases: [source.id, sourceUrlAlias(source.url, source.name)]
        }))
      : [])
  ];
  const weekKey = process.env.WEEKLY_SOURCE_WEEK_KEY ?? weeklySourceWeekKey();
  const segments = (pendingSegments ?? []) as Segment[];
  const missing = required.filter(
    (source) => !segments.some((segment) => segmentHasAlias(segment, source.aliases, weekKey))
  );

  console.log(
    JSON.stringify({
      ok: missing.length === 0,
      scope,
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

