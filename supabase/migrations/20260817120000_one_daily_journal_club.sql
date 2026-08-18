create or replace function public.activate_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.station_daily_schedules;
  source public.station_programs;
  repeated_journal_count integer;
  activated public.station_daily_schedules;
begin
  select * into candidate from public.station_daily_schedules where id = p_schedule_id;
  if candidate.id is null then raise exception 'Station schedule not found.'; end if;
  if extract(isodow from candidate.schedule_date) not between 1 and 5 then raise exception 'Regular journal activation is Monday-Friday only.'; end if;

  select * into source from public.station_programs
  where schedule_id = p_schedule_id and position = 0 and program_type = 'new'
    and status = 'verified' and youtube_video_id is not null;
  if source.id is null then raise exception 'The daily journal release must verify before activation.'; end if;
  if (select count(*) from public.station_programs where schedule_id = p_schedule_id and program_type = 'new') <> 1 then
    raise exception 'Regular programming permits exactly one new journal release per day.';
  end if;

  select count(*) into repeated_journal_count
  from public.station_programs candidate_program
  where candidate_program.schedule_id = p_schedule_id and candidate_program.program_type = 'new'
    and exists (
      select 1 from public.station_programs prior_program
      join public.station_daily_schedules prior_schedule on prior_schedule.id = prior_program.schedule_id
      where prior_schedule.id <> p_schedule_id
        and prior_schedule.schedule_date between candidate.schedule_date - (extract(isodow from candidate.schedule_date)::integer - 1)
          and candidate.schedule_date + (5 - extract(isodow from candidate.schedule_date)::integer)
        and prior_schedule.status in ('draft','building','verified','active','superseded')
        and prior_program.program_type = 'new'
        and prior_program.journal_id = candidate_program.journal_id
    );
  if repeated_journal_count <> 0 then raise exception 'A journal may appear only once in a Monday-Friday programming week.'; end if;

  insert into public.station_programs (
    schedule_id, position, specialty, journal_id, journal_name, program_type,
    source_program_id, starts_at_offset_minutes, duration_minutes, status,
    youtube_video_id, youtube_url, title, description, tags, card_ids,
    writeout_cards, render_checksum, failure_reason, updated_at
  )
  select p_schedule_id, position, source.specialty, source.journal_id,
    source.journal_name, 'journal_replay', source.id, position * 30, 30,
    'verified', source.youtube_video_id, source.youtube_url, source.title,
    source.description, source.tags, source.card_ids, source.writeout_cards,
    source.render_checksum, null, now()
  from generate_series(1, 5) as position
  on conflict (schedule_id, position) do update set
    specialty=excluded.specialty, journal_id=excluded.journal_id, journal_name=excluded.journal_name,
    program_type=excluded.program_type, source_program_id=excluded.source_program_id,
    starts_at_offset_minutes=excluded.starts_at_offset_minutes, status=excluded.status,
    youtube_video_id=excluded.youtube_video_id, youtube_url=excluded.youtube_url,
    title=excluded.title, description=excluded.description, tags=excluded.tags,
    card_ids=excluded.card_ids, writeout_cards=excluded.writeout_cards,
    render_checksum=excluded.render_checksum, failure_reason=null, updated_at=now();

  if (select count(*) from public.station_programs where schedule_id = p_schedule_id and status = 'verified') <> 6 then
    raise exception 'Daily station schedule must contain one release and five verified replay positions.';
  end if;
  update public.station_daily_schedules set status='superseded', updated_at=now() where status='active' and id <> p_schedule_id;
  update public.station_daily_schedules
  set status='active', activated_at=now(),
    verification_summary=verification_summary || jsonb_build_object(
      'mode', 'one_daily_journal_release',
      'youtube_release_times_eastern', jsonb_build_array('07:15'),
      'new_youtube_videos', 1, 'replay_positions', 5,
      'unused_cards_preserved', true, 'weekly_unique_journals', true),
    updated_at=now()
  where id=p_schedule_id returning * into activated;
  return activated;
end;
$$;

revoke all on function public.activate_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_station_schedule(uuid) to service_role;

create or replace function public.activate_weekend_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.station_daily_schedules;
  source public.station_programs;
  distinct_videos integer;
  activated public.station_daily_schedules;
begin
  select * into candidate from public.station_daily_schedules where id = p_schedule_id;
  if candidate.id is null then raise exception 'Weekend station schedule not found.'; end if;
  if extract(isodow from candidate.schedule_date) not in (6, 7) then raise exception 'Weekend roundup activation is Saturday-Sunday only.'; end if;

  select count(distinct youtube_video_id) into distinct_videos
  from public.station_programs
  where schedule_id = p_schedule_id and position = 0 and program_type = 'weekend_roundup'
    and status = 'verified' and youtube_video_id is not null;
  if distinct_videos <> 1 then raise exception 'The weekend roundup video must verify before activation.'; end if;
  select * into source from public.station_programs
  where schedule_id = p_schedule_id and position = 0 and program_type = 'weekend_roundup';

  insert into public.station_programs (
    schedule_id, position, specialty, journal_id, journal_name, program_type,
    source_program_id, starts_at_offset_minutes, duration_minutes, status,
    youtube_video_id, youtube_url, title, description, tags, card_ids,
    writeout_cards, render_checksum, failure_reason, updated_at
  )
  select p_schedule_id, position, source.specialty, null, source.journal_name,
    'weekend_replay', source.id, position * 30, 30, 'verified',
    source.youtube_video_id, source.youtube_url, source.title, source.description,
    source.tags, source.card_ids, source.writeout_cards, source.render_checksum,
    null, now()
  from generate_series(1, 5) as position
  on conflict (schedule_id, position) do update set
    specialty=excluded.specialty, journal_id=excluded.journal_id, journal_name=excluded.journal_name,
    program_type=excluded.program_type, source_program_id=excluded.source_program_id,
    starts_at_offset_minutes=excluded.starts_at_offset_minutes, status=excluded.status,
    youtube_video_id=excluded.youtube_video_id, youtube_url=excluded.youtube_url,
    title=excluded.title, description=excluded.description, tags=excluded.tags,
    card_ids=excluded.card_ids, writeout_cards=excluded.writeout_cards,
    render_checksum=excluded.render_checksum, failure_reason=null, updated_at=now();

  if (select count(*) from public.station_programs where schedule_id = p_schedule_id and status = 'verified') <> 6 then
    raise exception 'Weekend station schedule must contain one release and five verified replay positions.';
  end if;
  update public.station_daily_schedules set status='superseded', updated_at=now() where status='active' and id <> p_schedule_id;
  update public.station_daily_schedules
  set status='active', activated_at=now(),
    verification_summary=verification_summary || jsonb_build_object(
      'mode', 'weekend_top_articles', 'cycle_start', '09:00 America/New_York',
      'new_youtube_videos', 1, 'replay_positions', 5,
      'weekday_programming_mutated', false),
    updated_at=now()
  where id=p_schedule_id returning * into activated;
  return activated;
end;
$$;

revoke all on function public.activate_weekend_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_weekend_station_schedule(uuid) to service_role;
