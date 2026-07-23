import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildStationDraft, nextBreakInBoundary, stationHasStartedToday, stationPositionAt } from "@/lib/station/schedule";

assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:12:00Z"), "top").toISOString(), "2026-07-22T17:00:00.000Z");
assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:12:00Z"), "bottom").toISOString(), "2026-07-22T16:30:00.000Z");
assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:42:00Z"), "bottom").toISOString(), "2026-07-22T17:30:00.000Z");
assert.equal(stationPositionAt(new Date("2026-07-22T16:01:00Z")), 0, "Noon Eastern begins station position zero");
assert.equal(stationPositionAt(new Date("2026-07-22T18:31:00Z")), 5, "14:31 Eastern is the sixth half-hour position");
assert.equal(stationHasStartedToday(new Date("2026-07-24T12:59:00Z"), 540), false);
assert.equal(stationHasStartedToday(new Date("2026-07-24T13:00:00Z"), 540), true);
assert.equal(stationPositionAt(new Date("2026-07-24T13:00:00Z"), 540), 0);
assert.equal(stationPositionAt(new Date("2026-07-24T16:00:00Z"), 540), 0, "The wheel repeats every three hours after 9 AM ET");

const journals = Array.from({ length: 6 }, (_, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  name: `Journal ${index}`,
  specialty: `Specialty ${index}`,
  enabled: true
}));
const decks = Object.fromEntries(journals.map((journal) => [journal.id, { total: 1, cards: [{ segment: { id: journal.id } }] }]));
const draft = buildStationDraft({ scheduleDate: "2026-07-22", journals, journalCardDecks: decks } as Parameters<typeof buildStationDraft>[0]);
assert.equal(draft.length, 6);
assert.deepEqual(draft.map((program) => program.startsAtOffsetMinutes), [0, 30, 60, 90, 120, 150]);
assert.ok(draft.every((program) => program.durationMinutes === 30 && program.programType === "new"));
assert.ok(draft.every((program) => program.cardIds.length <= 12));

const weekdayWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
assert.match(weekdayWorkflow, /cron: "30 12 \* \* 1-5"/);
assert.match(weekdayWorkflow, /p_cycle_start_minutes\\\":540/);
assert.match(weekdayWorkflow, /unique \| length\) == 6/);
const rolloverMigration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260723193000_weekday_station_wheel_rollover.sql"), "utf8");
assert.match(rolloverMigration, /extract\(isodow from p_schedule_date\) not between 1 and 5/);
assert.match(rolloverMigration, /canonical_video_reuse', true/);
assert.match(rolloverMigration, /count\(\*\)[\s\S]*status = 'verified'\) <> 6/);

const cleanupSource = readFileSync(path.join(process.cwd(), "scripts", "delete-superseded-station-video.ts"), "utf8");
assert.match(cleanupSource, /Old video is still referenced by an active station schedule/);
assert.match(cleanupSource, /Old video is still the public stream-state video/);
assert.match(cleanupSource, /method: "DELETE"/);
assert.match(cleanupSource, /status: "failed"/);

console.log("Station schedule verification passed.");
