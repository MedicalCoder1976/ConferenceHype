import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { regionalJournalSeeds, REGIONAL_SERIES } from "@/lib/regionalJournalClub/catalog";
import { selectRegionalJournalCards } from "@/lib/regionalJournalClub/selection";
import { buildRegionalJournalMetadata, assertRegionalJournalMetadata } from "@/lib/youtube/regionalJournalMetadata";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { OncologyJournal, Segment } from "@/lib/types";

assert.equal(regionalJournalSeeds.filter((seed) => seed.series === "india").length, 20);
assert.equal(regionalJournalSeeds.filter((seed) => seed.series === "united_kingdom").length, 22);
assert.equal(new Set(regionalJournalSeeds.map((seed) => `${seed.series}:${seed.rssUrl}`)).size, 42);
assert.deepEqual(REGIONAL_SERIES.india.releaseDays, [2, 5]);
assert.deepEqual(REGIONAL_SERIES.united_kingdom.releaseDays, [3, 7]);

const journals = regionalJournalSeeds.slice(0, 12).map((seed, index) => ({ ...seed, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, enabled: true, regionalOnly: true })) as OncologyJournal[];
const segments = Array.from({ length: 24 }, (_, index) => {
  const journal = journals[index % journals.length];
  return { id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, title: `Regional trial ${index + 1}`, summary: "Background: source. Methods: cohort. Results: benefit. Discussion: context.", script: "Background: source. Methods: cohort. Results: benefit. Discussion: context.", contentType: "abstract_buzz", personaId: "echo-sage", personaName: "Echo Sage", hypeLevel: "restrained", language: "English", status: "approved", citations: [{ label: `${journal.name}: Regional trial ${index + 1}`, url: `https://pubmed.ncbi.nlm.nih.gov/${42000000 + index}/`, journalId: journal.id, publishedAt: "2026-08-10", sourceType: "official" }], socialBuzzItems: [], riskFlags: ["journal_card_v2", "journal_quality_passed", "structured_article_card"], confidenceScore: 95, createdAt: "2026-08-10T12:00:00Z" } as Segment;
});
const selected = selectRegionalJournalCards({ segments, journals, releaseDate: "2026-08-18", excludedCardIds: [segments[0].id] });
assert.equal(selected.length, 12);
assert.ok(!selected.some((segment) => segment.id === segments[0].id));
assert.equal(new Set(selected.map((segment) => segment.citations[0].journalId)).size, 12);

const baseTime = new Date("2026-08-18T14:00:00Z");
const slots = selected.map((segment, index) => ({ at: new Date(baseTime.getTime() + index * 60_000), kind: "statement", durationMinutes: 1, durationSeconds: 60, label: segment.title, segment })) as BroadcastSlot[];
const metadata = assertRegionalJournalMetadata(buildRegionalJournalMetadata({ hourStart: baseTime, slots, journalsById: new Map(journals.map((journal) => [journal.id, journal])), seriesDisplayName: "INDIA JOURNAL ARTICLES", specialties: ["Internal Medicine", "Cardiology"] }));
assert.match(metadata.title, /^JOURNAL CLUB \| INDIA JOURNAL ARTICLES \|/);
assert.match(metadata.description, /^JOURNAL CLUB - INDIA JOURNAL ARTICLES\nRelevant specialties: Internal Medicine; Cardiology\./);

const migration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260815020000_regional_journal_club_series.sql"), "utf8");
assert.match(migration, /enabled boolean not null default false/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on public\.regional_journal_programs from anon, authenticated/);
const cadence = readFileSync(path.join(process.cwd(), "lib", "station", "journalCadence.ts"), "utf8");
const schedule = readFileSync(path.join(process.cwd(), "lib", "station", "schedule.ts"), "utf8");
assert.match(cadence, /!journal\.regionalOnly/);
assert.match(schedule, /!journal\.regionalOnly/);
const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "regional-journal-club.yml"), "utf8");
const dbSource = readFileSync(path.join(process.cwd(), "lib", "db.ts"), "utf8");
const regionalDbSource = readFileSync(path.join(process.cwd(), "lib", "regionalJournalClub", "db.ts"), "utf8");
assert.match(workflow, /default: false/);
assert.match(workflow, /REGIONAL_JOURNAL_CLUB_PUBLISH_ENABLED/);
assert.doesNotMatch(workflow, /activate_station_schedule|activate_weekend_station_schedule|stream_state/);
assert.match(workflow, /NEXT_PUBLIC_SUPABASE_ANON_KEY: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_ANON_KEY \}\}/);
assert.equal(
  [...workflow.matchAll(/NEXT_PUBLIC_SUPABASE_ANON_KEY: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_ANON_KEY \}\}/g)].length,
  2,
  "Both regional preparation and rendering must receive the existing anon key"
);
assert.doesNotMatch(dbSource.match(/export async function upsertRegionalJournalCatalogToDb\(\)[\s\S]*?\n}\n/)?.[0] ?? "", /hasSupabase\(\)/);
assert.match(regionalDbSource, /patch\.cardIds\?\.filter\(\(cardId\) => UUID_PATTERN\.test\(cardId\)\)/);
console.log("Regional Journal Club verification passed.");
