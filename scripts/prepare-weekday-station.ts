import { loadEnvConfig } from "@next/env";
import { appendFile } from "node:fs/promises";
loadEnvConfig(process.cwd());

function easternLocalToUtc(date: string, minutes: number) {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let guess = new Date(desired);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess);
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const observed = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    guess = new Date(guess.getTime() + desired - observed);
  }
  return guess.toISOString();
}

async function main() {
  const targetDate = process.env.STATION_SCHEDULE_DATE;
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("STATION_SCHEDULE_DATE must be YYYY-MM-DD.");
  const weekday = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  if (weekday < 1 || weekday > 5) throw new Error("Weekday station schedules are Monday-Friday only.");
  const [{ buildJournalCardDecks }, { filterBroadcastReadySegments }, { getAllApprovedSegmentsForStationFromDb, getAllPendingSegmentsFromDb, getOncologyJournalsFromDb }, { buildStationDraft, STATION_NEW_PROGRAMS_PER_WEEKDAY }, { eligibleNextDayDeck, orderedCadenceJournals }, { minimumSubstantiveCards }, { saveStationDraftToDb }] = await Promise.all([
    import("@/lib/cardDeck"), import("@/lib/data"), import("@/lib/db"), import("@/lib/station/schedule"), import("@/lib/station/journalCadence"), import("@/lib/media/broadcastQuality"), import("@/lib/station/db")
  ]);
  const [pendingSegments, approvedSegments, oncologyJournals] = await Promise.all([
    getAllPendingSegmentsFromDb(), getAllApprovedSegmentsForStationFromDb(), getOncologyJournalsFromDb()
  ]);
  const journals = oncologyJournals ?? [];
  const deckSegments = filterBroadcastReadySegments([...(pendingSegments ?? []), ...(approvedSegments ?? [])]);
  const decks = buildJournalCardDecks(deckSegments, journals);
  let programs: ReturnType<typeof buildStationDraft> = [];
  const requiredCards = minimumSubstantiveCards("journal30", "station-program");
  for (const journal of orderedCadenceJournals(targetDate, journals)) {
    const eligibleDeck = eligibleNextDayDeck(decks[journal.id], targetDate);
    if (eligibleDeck.cards.length < requiredCards) continue;
    programs = buildStationDraft({ scheduleDate: targetDate, journals: [journal], journalCardDecks: { [journal.id]: eligibleDeck }, programCount: 1 });
    if (programs.length === 1) break;
  }
  if (programs.length !== STATION_NEW_PROGRAMS_PER_WEEKDAY || programs.some((program) => program.programType !== "new")) throw new Error("No fresh, substantive article from the approved top-journal cadence was available for next-day release.");
  const schedule = await saveStationDraftToDb({ scheduleDate: targetDate, timezone: "America/New_York", cycleStartMinutes: 6 * 60 + 15, programs });
  if (!schedule) throw new Error("Supabase is not configured.");
  const releaseMinutes = [6 * 60 + 15];
  // Reservation never changes segment status. Only this original is rendered;
  // every unselected card remains approved in its journal queue.
  const scheduledOriginals = schedule.programs.filter((program) => program.programType === "new" && program.position < STATION_NEW_PROGRAMS_PER_WEEKDAY);
  if (scheduledOriginals.length !== STATION_NEW_PROGRAMS_PER_WEEKDAY) throw new Error("Saved schedule did not contain exactly one weekday original.");
  const matrix = scheduledOriginals.map((program) => {
    const publishAt = easternLocalToUtc(targetDate, releaseMinutes[program.position]);
    return { station_program_id: program.id, journal_id: program.journalId, stream_start_time: publishAt, youtube_publish_at: publishAt };
  });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
  console.log(JSON.stringify({ ok: true, scheduleDate: targetDate, scheduleId: schedule.id, programs: schedule.programs.map((program) => ({ position: program.position, journalName: program.journalName, specialty: program.specialty, cardCount: program.cardIds.length })) }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
