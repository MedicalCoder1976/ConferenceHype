import { appendFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { REGIONAL_SERIES, type RegionalSeriesCode } from "@/lib/regionalJournalClub/catalog";
import { getRegionalSeries, getReservedRegionalCardIds, saveRegionalProgram } from "@/lib/regionalJournalClub/db";
import { REGIONAL_PROGRAM_CARD_COUNT, selectRegionalJournalCards } from "@/lib/regionalJournalClub/selection";

loadEnvConfig(process.cwd());

function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess);
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const observed = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    guess = new Date(guess.getTime() + desired - observed);
  }
  return guess.toISOString();
}

async function main() {
  const code = process.env.REGIONAL_SERIES_CODE as RegionalSeriesCode;
  if (!(code in REGIONAL_SERIES)) throw new Error("REGIONAL_SERIES_CODE must be india or united_kingdom.");
  const releaseDate = process.env.REGIONAL_RELEASE_DATE;
  if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error("REGIONAL_RELEASE_DATE must be YYYY-MM-DD.");

  const [{ upsertAdminCatalogSeedsToDb, upsertRegionalJournalCatalogToDb, getAllPendingSegmentsFromDb, getAllApprovedSegmentsForStationFromDb }, { filterBroadcastReadySegments }, { createAdminClient }] = await Promise.all([
    import("@/lib/db"), import("@/lib/data"), import("@/lib/supabase/admin")
  ]);
  await upsertAdminCatalogSeedsToDb();
  await upsertRegionalJournalCatalogToDb();
  const series = await getRegionalSeries(code);
  if (!series) throw new Error(`Regional series ${code} is not installed. Apply the regional series migration first.`);
  if (series.journals.length < 12) throw new Error(`${series.displayName} has only ${series.journals.length} active member journals; at least 12 are required.`);
  const isoWeekday = new Date(`${releaseDate}T12:00:00Z`).getUTCDay() || 7;
  if (!series.releaseDays.includes(isoWeekday)) throw new Error(`${series.displayName} is not scheduled for weekday ${isoWeekday}.`);

  const [pending, approved, priorRegionalIds, stationRows] = await Promise.all([
    getAllPendingSegmentsFromDb(),
    getAllApprovedSegmentsForStationFromDb(),
    getReservedRegionalCardIds(releaseDate),
    createAdminClient().from("station_programs").select("card_ids").neq("status", "failed")
  ]);
  if (stationRows.error) throw stationRows.error;
  const excluded = [...new Set([...priorRegionalIds, ...(stationRows.data ?? []).flatMap((row) => row.card_ids ?? [])])];
  const candidates = filterBroadcastReadySegments([...(pending ?? []), ...(approved ?? [])]);
  let selected = [] as typeof candidates;
  for (const ageDays of [14, 21, 28, 35]) {
    selected = selectRegionalJournalCards({ segments: candidates, journals: series.journals, releaseDate, excludedCardIds: excluded, maximumAgeDays: ageDays, cardCount: Math.max(REGIONAL_PROGRAM_CARD_COUNT, series.minimumCards) });
    if (selected.length >= series.minimumCards) break;
  }
  if (selected.length < series.minimumCards) throw new Error(`${series.displayName} has ${selected.length} eligible unused cards; ${series.minimumCards} are required. No broadcast was scheduled.`);

  const journalById = new Map(series.journals.map((journal) => [journal.id, journal]));
  const journalIds = [...new Set(selected.flatMap((segment) => segment.citations.map((citation) => citation.journalId).filter((id): id is string => Boolean(id && journalById.has(id)))))];
  const specialties = [...new Set(journalIds.map((id) => journalById.get(id)?.specialty).filter((value): value is string => Boolean(value)))];
  const startsAt = localDateTimeToUtc(releaseDate, series.releaseTime, series.timezone);
  const publishEnabled = series.enabled && process.env.REGIONAL_SERIES_PUBLISH_ENABLED === "true";
  const program = await saveRegionalProgram({ seriesId: series.id, releaseDate, startsAt, status: publishEnabled ? "planned" : "shadow_verified", cardIds: selected.map((segment) => segment.id), journalIds, specialties });
  const matrix = publishEnabled ? [{ regional_program_id: program.id, series_code: code, stream_start_time: startsAt }] : [];
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\nshould_publish=${publishEnabled}\n`);
  console.log(JSON.stringify({ ok: true, shadow: !publishEnabled, series: series.displayName, journalPool: series.journals.length, releaseDate, startsAt, cardCount: selected.length, journalCount: journalIds.length, specialties, programId: program.id }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
