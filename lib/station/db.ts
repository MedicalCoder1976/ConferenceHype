import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  StationBreakIn,
  StationDailySchedule,
  StationProgram
} from "@/lib/station/types";
import type { StationProgramDraft } from "@/lib/station/schedule";

type ScheduleRow = {
  id: string;
  schedule_date: string;
  timezone: string;
  status: StationDailySchedule["status"];
  cycle_start_minutes: number;
  verification_summary: Record<string, unknown>;
  previous_schedule_id?: string | null;
  activated_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ProgramRow = {
  id: string;
  schedule_id: string;
  position: number;
  specialty: string;
  journal_id?: string | null;
  journal_name: string;
  program_type: StationProgram["programType"];
  source_program_id?: string | null;
  starts_at_offset_minutes: number;
  duration_minutes: 30;
  status: StationProgram["status"];
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  card_ids?: string[] | null;
  writeout_cards?: StationProgram["writeoutCards"] | null;
  render_checksum?: string | null;
  failure_reason?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

type BreakInRow = {
  id: string;
  target_at: string;
  placement: StationBreakIn["placement"];
  duration_minutes: 15;
  title: string;
  summary: string;
  script: string;
  specialty?: string | null;
  source_label: string;
  source_url: string;
  segment_id?: string | null;
  status: StationBreakIn["status"];
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
};

function toProgram(row: ProgramRow): StationProgram {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    position: row.position,
    specialty: row.specialty,
    journalId: row.journal_id ?? undefined,
    journalName: row.journal_name,
    programType: row.program_type,
    sourceProgramId: row.source_program_id ?? undefined,
    startsAtOffsetMinutes: row.starts_at_offset_minutes,
    durationMinutes: 30,
    status: row.status,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? [],
    cardIds: row.card_ids ?? [],
    writeoutCards: row.writeout_cards ?? [],
    renderChecksum: row.render_checksum ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSchedule(row: ScheduleRow, programs: ProgramRow[]): StationDailySchedule {
  return {
    id: row.id,
    scheduleDate: row.schedule_date,
    timezone: row.timezone,
    status: row.status,
    cycleStartMinutes: row.cycle_start_minutes,
    verificationSummary: row.verification_summary ?? {},
    previousScheduleId: row.previous_schedule_id ?? undefined,
    activatedAt: row.activated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    programs: programs.map(toProgram).sort((a, b) => a.position - b.position)
  };
}

function toBreakIn(row: BreakInRow): StationBreakIn {
  return {
    id: row.id,
    targetAt: row.target_at,
    placement: row.placement,
    durationMinutes: 15,
    title: row.title,
    summary: row.summary,
    script: row.script,
    specialty: row.specialty ?? undefined,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    segmentId: row.segment_id ?? undefined,
    status: row.status,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function hydrateSchedules(rows: ScheduleRow[]) {
  if (rows.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("station_programs")
    .select("*")
    .in("schedule_id", rows.map((row) => row.id));
  if (error) throw error;
  const programs = (data ?? []) as ProgramRow[];
  return rows.map((row) =>
    toSchedule(row, programs.filter((program) => program.schedule_id === row.id))
  );
}

export async function getStationSchedulesFromDb(limit = 14) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_daily_schedules")
    .select("*")
    .order("schedule_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return hydrateSchedules((data ?? []) as ScheduleRow[]);
}

export async function getStationProgramFromDb(id: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_programs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProgram(data as ProgramRow) : null;
}

export async function getActiveStationScheduleFromDb(date: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_daily_schedules")
    .select("*")
    .eq("schedule_date", date)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await hydrateSchedules([data as ScheduleRow]))[0] ?? null;
}

export async function saveStationDraftToDb({
  scheduleDate,
  timezone,
  programs
}: {
  scheduleDate: string;
  timezone: string;
  programs: StationProgramDraft[];
}) {
  if (!hasSupabase()) return null;
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("station_daily_schedules")
    .select("id,status")
    .eq("schedule_date", scheduleDate)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && !["draft", "failed"].includes(existing.status)) {
    throw new Error(
      "This station day is already building, verified, active, or archived and cannot be regenerated."
    );
  }
  const { data: scheduleData, error: scheduleError } = await supabase
    .from("station_daily_schedules")
    .upsert(
      {
        schedule_date: scheduleDate,
        timezone,
        status: "draft",
        updated_at: new Date().toISOString()
      },
      { onConflict: "schedule_date" }
    )
    .select("*")
    .single();
  if (scheduleError) throw scheduleError;
  const schedule = scheduleData as ScheduleRow;
  const { error: deleteError } = await supabase
    .from("station_programs")
    .delete()
    .eq("schedule_id", schedule.id)
    .eq("status", "planned");
  if (deleteError) throw deleteError;
  const { data: programData, error: programError } = await supabase
    .from("station_programs")
    .upsert(
      programs.map((program) => ({
        schedule_id: schedule.id,
        position: program.position,
        specialty: program.specialty,
        journal_id: program.journalId ?? null,
        journal_name: program.journalName,
        program_type: program.programType,
        source_program_id: program.sourceProgramId ?? null,
        starts_at_offset_minutes: program.startsAtOffsetMinutes,
        duration_minutes: 30,
        status: program.status,
        card_ids: program.cardIds,
        youtube_video_id: program.youtubeVideoId ?? null,
        youtube_url: program.youtubeUrl ?? null,
        title: program.title ?? null,
        description: program.description ?? null,
        writeout_cards: program.writeoutCards,
        updated_at: new Date().toISOString()
      })),
      { onConflict: "schedule_id,position" }
    )
    .select("*");
  if (programError) throw programError;
  return toSchedule(schedule, (programData ?? []) as ProgramRow[]);
}

export async function activateStationScheduleInDb(scheduleId: string) {
  if (!hasSupabase()) return null;
  const supabase = createAdminClient();
  const { data: programs, error: programError } = await supabase
    .from("station_programs")
    .select("*")
    .eq("schedule_id", scheduleId);
  if (programError) throw programError;
  const rows = (programs ?? []) as ProgramRow[];
  if (rows.length !== 6 || rows.some((row) => row.status !== "verified")) {
    throw new Error("All six station programs must be verified before activation.");
  }
  const { data, error } = await supabase.rpc("activate_station_schedule", { p_schedule_id: scheduleId });
  if (error) throw error;
  const activated = Array.isArray(data) ? data[0] : data;
  return toSchedule(activated as ScheduleRow, rows);
}

export async function createStationBreakInInDb(input: {
  targetAt: string;
  placement: "top" | "bottom";
  title: string;
  summary: string;
  script: string;
  specialty?: string;
  sourceLabel: string;
  sourceUrl: string;
  segmentId: string;
}) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_breakins")
    .insert({
      target_at: input.targetAt,
      placement: input.placement,
      title: input.title,
      summary: input.summary,
      script: input.script,
      specialty: input.specialty ?? null,
      source_label: input.sourceLabel,
      source_url: input.sourceUrl,
      segment_id: input.segmentId,
      status: "approved"
    })
    .select("*")
    .single();
  if (error) throw error;
  return toBreakIn(data as BreakInRow);
}

export async function getStationBreakInsFromDb(from: string, to: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_breakins")
    .select("*")
    .gte("target_at", from)
    .lt("target_at", to)
    .neq("status", "cancelled")
    .order("target_at");
  if (error) throw error;
  return ((data ?? []) as BreakInRow[]).map(toBreakIn);
}
