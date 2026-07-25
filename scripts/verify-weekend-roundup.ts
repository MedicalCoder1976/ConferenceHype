import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rankWeekendCandidates, splitWeekendPrograms } from "@/lib/station/weekendRoundup";
import { buildWeekendRoundupSlots } from "@/lib/rundown/weekendRoundupSlots";
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
const segments = Array.from({ length: 30 }, (_, index) => segment(index, index < 4));
const journalsById = new Map([[journalA.id, journalA], [journalB.id, journalB]]);
const ranked = rankWeekendCandidates({ segments, journalsById });
assert.ok(ranked[0].studyNames.length > 0, "Explicitly named trials should rank first.");
const programs = splitWeekendPrograms(ranked);
assert.deepEqual(programs.map((program) => program.length), [12, 12]);
assert.equal(new Set(programs.flat().map((item) => item.segment.id)).size, 24);

const baseTime = new Date("2026-07-25T13:00:00Z");
const slots = buildWeekendRoundupSlots({ segments: programs[0].map((item) => ({ ...item.segment, status: "approved" as const })), baseTime, part: 1 });
assert.equal(slots.filter((slot) => slot.segment?.riskFlags.includes("weekend_roundup_outro")).length, 1);
assert.ok(slots.some((slot) => slot.kind === "music"));
assert.equal(slots.filter((slot) => slot.segment && !slot.segment.riskFlags.includes("weekend_roundup_outro") && !slot.segment.riskFlags.includes("journal_show_disclaimer")).length, 12);
const metadata = assertWeekendRoundupMetadata(buildWeekendRoundupMetadata({ hourStart: baseTime, slots, journalsById, part: 1 }));
assert.match(metadata.title, /^Weekend Roundup of Top Medical Journal Articles of the Week \| Part 1/);
assert.match(metadata.description, /Featured trials and studies:/);
assert.match(metadata.description, /Specialties: Neurology/);
assert.match(metadata.description, /Journals: Neurology/);
assert.ok(metadata.studyNames.some((name) => /RESOLUTION Trial/i.test(name)));

const workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekend-medical-roundup.yml"), "utf8");
assert.match(workflow, /cron: "0 12 \* \* 0,6"/);
assert.match(workflow, /cron: "0 13 \* \* 0,6"/);
assert.match(workflow, /HOUR.*08/);
assert.match(workflow, /max-parallel: 2/);
assert.match(workflow, /activate_weekend_station_schedule/);
const weekdayWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
assert.match(weekdayWorkflow, /cron: "30 11 \* \* 1-5"/);
assert.doesNotMatch(weekdayWorkflow, /weekend30/);
const migration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260725120000_weekend_roundup_station.sql"), "utf8");
assert.match(migration, /extract\(isodow from candidate\.schedule_date\) not in \(6, 7\)/);
assert.match(migration, /distinct_videos <> 2/);
assert.match(migration, /generate_series\(2, 5\)/);
assert.match(migration, /weekday_programming_mutated', false/);
console.log("Weekend roundup verification passed.");