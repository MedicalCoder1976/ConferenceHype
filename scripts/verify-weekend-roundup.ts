import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WEEKEND_CARDS_PER_PROGRAM, rankWeekendCandidates, splitWeekendPrograms } from "@/lib/station/weekendRoundup";
import { WEEKEND_CONTENT_SECONDS, buildWeekendRoundupSlots } from "@/lib/rundown/weekendRoundupSlots";
import { buildWeekendRoundupMetadata, assertWeekendRoundupMetadata } from "@/lib/youtube/weekendRoundupMetadata";
import type { OncologyJournal, Segment } from "@/lib/types";

const journalA = { id: "00000000-0000-4000-8000-000000000001", name: "Nature Medicine", specialty: "Internal Medicine", enabled: true } as OncologyJournal;
const journalB = { id: "00000000-0000-4000-8000-000000000002", name: "Neurology", specialty: "Neurology", enabled: true } as OncologyJournal;
function segment(index: number, trial = false): Segment {
  const journal = index % 2 ? journalA : journalB;
  const title = trial ? `RESOLUTION Trial ${index}: randomized phase 2 clinical trial` : `Important medical article ${index}`;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    summary: `Background: source. Methods: prospective cohort. Results: ${index + 10} patients improved. Discussion: clinically relevant results.`,
    script: `From the 2026 Jul edition of ${journal.name}. Background: source. Methods: prospective cohort. Results: ${index + 10} patients improved. Discussion: clinically relevant results.`,
    contentType: "abstract_buzz",
    personaId: "echo-sage",
    personaName: "TumorCrusher",
    hypeLevel: "restrained",
    language: "English",
    status: "rendered",
    citations: [{ label: `${journal.name}: ${title}`, url: `https://pubmed.ncbi.nlm.nih.gov/${41000000 + index}/`, journalId: journal.id, publishedAt: "2026 Jul", sourceType: "official" }],
    socialBuzzItems: [],
    riskFlags: ["journal_card_v2", "journal_quality_passed", "structured_article_card"],
    confidenceScore: 95,
    createdAt: "2026-07-24T12:00:00Z"
  };
}
const segments = Array.from({ length: 60 }, (_, index) => segment(index, index < 4));
const journalsById = new Map([[journalA.id, journalA], [journalB.id, journalB]]);
const ranked = rankWeekendCandidates({ segments, journalsById });
assert.ok(ranked[0].studyNames.length > 0, "Explicitly named trials should rank first.");
const programs = splitWeekendPrograms(ranked);
assert.equal(WEEKEND_CARDS_PER_PROGRAM, 24);
assert.equal(WEEKEND_CONTENT_SECONDS, 55);
assert.deepEqual(programs.map((program) => program.length), [24]);
assert.equal(new Set(programs.flat().map((item) => item.segment.id)).size, 24);

const baseTime = new Date("2026-07-25T13:00:00Z");
const slots = buildWeekendRoundupSlots({ segments: programs[0].map((item) => ({ ...item.segment, status: "approved" as const })), baseTime, part: 1 });
assert.equal(slots.filter((slot) => slot.segment?.riskFlags.includes("weekend_roundup_outro")).length, 1);
assert.ok(slots.some((slot) => slot.kind === "music"));
assert.equal(slots.filter((slot) => slot.segment && !slot.segment.riskFlags.includes("weekend_roundup_outro") && !slot.segment.riskFlags.includes("journal_show_disclaimer")).length, 24);
assert.ok(
  slots.at(-1)!.at.getTime() + slots.at(-1)!.durationSeconds * 1000 <= baseTime.getTime() + 30 * 60 * 1000,
  "The planned 24-card rundown must fit before measured render-time reconciliation."
);
const metadata = assertWeekendRoundupMetadata(buildWeekendRoundupMetadata({ hourStart: baseTime, slots, journalsById, part: 1 }));
assert.match(metadata.title, /^JOURNAL CLUB \| Neurology \/ Internal Medicine \| Neurology:/);
assert.equal(metadata.clinicalTopic, "Neurology");
assert.ok(metadata.thumbnailHeadline);
assert.match(metadata.description, /Featured trials and studies:/);
assert.match(metadata.description, /^JOURNAL CLUB\nRelevant specialties: Neurology; Internal Medicine\./);
assert.match(metadata.description, /Journals: Neurology/);
assert.ok(metadata.studyNames.some((name) => /RESOLUTION Trial/i.test(name)));
assert.deepEqual(metadata.thumbnailJournalNames, ["Neurology", "Nature Medicine"]);
assert.equal(metadata.thumbnailJournalCount, 2);
assert.deepEqual(metadata.relevantSpecialties, ["Neurology", "Internal Medicine"]);

const renderSource = readFileSync(path.join(process.cwd(), "scripts", "render-hour-broadcast.ts"), "utf8");
assert.match(renderSource, /Measured broadcast frame reconciled/);
assert.match(renderSource, /cardCacheKeys\.splice\(insertAt, 0, undefined\)/);

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekend-medical-roundup.yml"), "utf8");
assert.match(workflow, /cron: "0 12 \* \* 0,6"/);
assert.match(workflow, /cron: "0 13 \* \* 0,6"/);
assert.match(workflow, /HOUR.*08/);
assert.match(workflow, /max-parallel: 1/);
assert.match(workflow, /activate_weekend_station_schedule/);
const weekdayWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
assert.match(weekdayWorkflow, /cron: "30 3 \* \* 1-5"/);
assert.doesNotMatch(weekdayWorkflow, /weekend30/);
const migration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260817120000_one_daily_journal_club.sql"), "utf8");
assert.match(migration, /extract\(isodow from candidate\.schedule_date\) not in \(6, 7\)/);
assert.match(migration, /distinct_videos <> 1/);
assert.match(migration, /generate_series\(1, 5\)/);
assert.match(migration, /weekday_programming_mutated', false/);
console.log("Weekend roundup verification passed.");
