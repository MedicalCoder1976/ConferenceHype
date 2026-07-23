import assert from "node:assert/strict";
import { buildStationDraft, nextBreakInBoundary, stationPositionAt } from "@/lib/station/schedule";

assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:12:00Z"), "top").toISOString(), "2026-07-22T17:00:00.000Z");
assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:12:00Z"), "bottom").toISOString(), "2026-07-22T16:30:00.000Z");
assert.equal(nextBreakInBoundary(new Date("2026-07-22T16:42:00Z"), "bottom").toISOString(), "2026-07-22T17:30:00.000Z");
assert.equal(stationPositionAt(new Date("2026-07-22T16:01:00Z")), 0, "Noon Eastern begins station position zero");
assert.equal(stationPositionAt(new Date("2026-07-22T18:31:00Z")), 5, "14:31 Eastern is the sixth half-hour position");

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

console.log("Station schedule verification passed.");
