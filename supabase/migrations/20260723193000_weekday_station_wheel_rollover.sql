create or replace function public.roll_weekday_station_schedule(
  p_schedule_date date,
  p_cycle_start_minutes integer default 540
)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  source_schedule public.station_daily_schedules;
  target_schedule public.station_daily_schedules;
begin
  if extract(isodow from p_schedule_date) not between 1 and 5 then
    raise exception 'Station schedules may only roll forward Monday through Friday.';
  end if;
  if p_cycle_start_minutes < 0 or p_cycle_start_minutes >= 1440 then
    raise exception 'cycle_start_minutes must be between 0 and 1439.';
  end if;

  select * into target_schedule
  from public.station_daily_schedules
  where schedule_date = p_schedule_date;
  if target_schedule.id is not null and target_schedule.status = 'active' then
    return target_schedule;
  end if;
  if target_schedule.id is not null then
    raise exception 'A non-active schedule already exists for % and requires operator review.', p_schedule_date;
  end if;

  select * into source_schedule
  from public.station_daily_schedules
  where status = 'active' and schedule_date < p_schedule_date
  order by schedule_date desc, activated_at desc
  limit 1;
  if source_schedule.id is null then
    raise exception 'No earlier active station schedule is available.';
  end if;
  if (select count(*) from public.station_programs where schedule_id = source_schedule.id and status = 'verified') <> 6 then
    raise exception 'The active source wheel must contain exactly six verified programs.';
  end if;

  insert into public.station_daily_schedules (
    schedule_date, timezone, status, cycle_start_minutes, previous_schedule_id,
    verification_summary, updated_at
  ) values (
    p_schedule_date, 'America/New_York', 'verified', p_cycle_start_minutes,
    source_schedule.id,
    jsonb_build_object(
      'mode', 'verified_replay_wheel',
      'source_schedule_id', source_schedule.id,
      'canonical_video_reuse', true,
      'youtube_duplicate_uploads_created', 0
    ),
    now()
  ) returning * into target_schedule;

  insert into public.station_programs (
    schedule_id, position, specialty, journal_id, journal_name, program_type,
    source_program_id, starts_at_offset_minutes, duration_minutes, status,
    youtube_video_id, youtube_url, title, description, tags, card_ids,
    writeout_cards, render_checksum, failure_reason, updated_at
  )
  select
    target_schedule.id, position, specialty, journal_id, journal_name,
    'journal_replay', id, starts_at_offset_minutes, duration_minutes, 'verified',
    youtube_video_id, youtube_url, title, description, tags, card_ids,
    writeout_cards, render_checksum, null, now()
  from public.station_programs
  where schedule_id = source_schedule.id and status = 'verified'
  order by position;

  select * into target_schedule
  from public.activate_station_schedule(target_schedule.id);
  return target_schedule;
end;
$$;

revoke all on function public.roll_weekday_station_schedule(date, integer) from public, anon, authenticated;
grant execute on function public.roll_weekday_station_schedule(date, integer) to service_role;