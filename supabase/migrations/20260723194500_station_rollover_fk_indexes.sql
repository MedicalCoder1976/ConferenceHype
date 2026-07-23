create index if not exists station_daily_schedules_previous_schedule_idx
  on public.station_daily_schedules (previous_schedule_id);
create index if not exists station_programs_source_program_idx
  on public.station_programs (source_program_id);