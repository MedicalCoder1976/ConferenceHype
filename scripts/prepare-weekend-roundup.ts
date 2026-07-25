import { loadEnvConfig } from "@next/env";
import { appendFile } from "node:fs/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rankWeekendCandidates,
  splitWeekendPrograms,
  WEEKEND_CARDS_PER_PROGRAM,
  WEEKEND_CYCLE_START_MINUTES
} from "@/lib/station/weekendRoundup";
loadEnvConfig(process.cwd());

function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

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
  const day = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  if (day !== 0 && day !== 6) throw new Error("Weekend roundup schedules are Saturday-Sunday only.");
  const weekStart = mondayOf(targetDate);
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);
  const friday = weekEnd.toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { data: sourcePrograms, error: sourceError } = await supabase
    .from("station_programs")
    .select("card_ids,youtube_video_id,station_daily_schedules!inner(schedule_date,status)")
    .eq("status", "verified")
    .not("youtube_video_id", "is", null)
    .gte("station_daily_schedules.schedule_date", weekStart)
    .lte("station_daily_schedules.schedule_date", friday)
    .in("station_daily_schedules.status", ["active", "superseded", "verified"]);
  if (sourceError) throw sourceError;
  const broadcastCardIds = [...new Set((sourcePrograms ?? []).flatMap((program) => program.card_ids ?? []))];
  if (broadcastCardIds.length < WEEKEND_CARDS_PER_PROGRAM * 2) {
    throw new Error(`Only ${broadcastCardIds.length} actually-broadcast weekday cards were found; 24 are required for two weekend programs.`);
  }
  const [{ getSegmentsByIdsFromDb, getOncologyJournalsFromDb }] = await Promise.all([import("@/lib/db")]);
  const [segments, journals] = await Promise.all([
    getSegmentsByIdsFromDb(broadcastCardIds),
    getOncologyJournalsFromDb()
  ]);
  const { data: articles, error: articleError } = await supabase
    .from("journal_articles")
    .select("card_segment_id,abstract_text")
    .in("card_segment_id", broadcastCardIds);
  if (articleError) throw articleError;
  const sourceTextBySegmentId = new Map((articles ?? []).map((row) => [row.card_segment_id, row.abstract_text ?? ""]));
  const excludedSegmentIds = new Set<string>();
  if (day === 0) {
    const saturday = new Date(`${targetDate}T12:00:00Z`);
    saturday.setUTCDate(saturday.getUTCDate() - 1);
    const { data: saturdayPrograms, error: saturdayError } = await supabase
      .from("station_programs")
      .select("card_ids,station_daily_schedules!inner(schedule_date)")
      .eq("program_type", "weekend_roundup")
      .eq("station_daily_schedules.schedule_date", saturday.toISOString().slice(0, 10));
    if (saturdayError) throw saturdayError;
    for (const id of (saturdayPrograms ?? []).flatMap((program) => program.card_ids ?? [])) excludedSegmentIds.add(id);
  }
  const journalsById = new Map((journals ?? []).map((journal) => [journal.id, journal]));
  let ranked = rankWeekendCandidates({ segments, journalsById, sourceTextBySegmentId, excludedSegmentIds });
  if (ranked.length < WEEKEND_CARDS_PER_PROGRAM * 2 && excludedSegmentIds.size > 0) {
    console.warn("Fewer than 24 unused Sunday cards remain; reusing the next-best Saturday cards to keep both slots complete.");
    ranked = rankWeekendCandidates({ segments, journalsById, sourceTextBySegmentId });
  }
  const selected = splitWeekendPrograms(ranked);
  if (selected.some((program) => program.length < WEEKEND_CARDS_PER_PROGRAM)) {
    throw new Error("Could not select 12 quality-passed, actually-broadcast cards for each weekend slot.");
  }
  const summary = selected.map((program, index) => ({
    part: index + 1,
    cards: program.map((candidate) => ({
      id: candidate.segment.id,
      title: candidate.segment.title,
      score: candidate.score,
      studyNames: candidate.studyNames,
      specialty: candidate.specialty,
      journal: candidate.journal.name
    }))
  }));
  if (process.env.WEEKEND_ROUNDUP_DRY_RUN === "1") {
    console.log(JSON.stringify({ ok: true, dryRun: true, targetDate, weekStart, friday, weekdayBroadcastCards: broadcastCardIds.length, programs: summary }, null, 2));
    return;
  }
  const { saveStationDraftToDb } = await import("@/lib/station/db");
  const schedule = await saveStationDraftToDb({
    scheduleDate: targetDate,
    timezone: "America/New_York",
    cycleStartMinutes: WEEKEND_CYCLE_START_MINUTES,
    programs: selected.map((program, position) => ({
      position,
      specialty: "Multispecialty",
      journalName: "Weekend Roundup of Top Medical Journal Articles of the Week",
      programType: "weekend_roundup" as const,
      startsAtOffsetMinutes: position * 30,
      durationMinutes: 30 as const,
      status: "planned" as const,
      cardIds: program.map((candidate) => candidate.segment.id),
      writeoutCards: []
    }))
  });
  if (!schedule) throw new Error("Supabase is not configured.");
  const matrix = schedule.programs.map((program) => ({
    station_program_id: program.id,
    program_mode: "weekend30",
    stream_start_time: easternLocalToUtc(targetDate, WEEKEND_CYCLE_START_MINUTES + program.startsAtOffsetMinutes),
    part: program.position + 1
  }));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\nschedule_id=${schedule.id}\n`);
  }
  console.log(JSON.stringify({ ok: true, targetDate, scheduleId: schedule.id, programs: summary }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });