alter table public.station_programs drop constraint if exists station_programs_type_check;
alter table public.station_programs add constraint station_programs_type_check
  check (program_type in ('new', 'journal_replay', 'specialty_replay', 'fallback', 'weekend_roundup', 'weekend_replay'));

create or replace function public.activate_weekend_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.station_daily_schedules;
  originals integer;
  distinct_videos integer;
  activated public.station_daily_schedules;
begin
  select * into candidate from public.station_daily_schedules where id = p_schedule_id;
  if candidate.id is null then raise exception 'Weekend station schedule not found.'; end if;
  if extract(isodow from candidate.schedule_date) not in (6, 7) then
    raise exception 'Weekend roundup activation is Saturday-Sunday only.';
  end if;
  select count(*), count(distinct youtube_video_id)
    into originals, distinct_videos
  from public.station_programs
  where schedule_id = p_schedule_id
    and position in (0, 1)
    and program_type = 'weekend_roundup'
    and status = 'verified'
    and youtube_video_id is not null;
  if originals <> 2 or distinct_videos <> 2 then
    raise exception 'Both distinct weekend roundup videos must verify before activation.';
  end if;

  insert into public.station_programs (
    schedule_id, position, specialty, journal_id, journal_name, program_type,
    source_program_id, starts_at_offset_minutes, duration_minutes, status,
    youtube_video_id, youtube_url, title, description, tags, card_ids,
    writeout_cards, render_checksum, failure_reason, updated_at
  )
  select
    p_schedule_id,
    repeated.position,
    source.specialty,
    null,
    source.journal_name,
    'weekend_replay',
    source.id,
    repeated.position * 30,
    30,
    'verified',
    source.youtube_video_id,
    source.youtube_url,
    source.title,
    source.description,
    source.tags,
    source.card_ids,
    source.writeout_cards,
    source.render_checksum,
    null,
    now()
  from generate_series(2, 5) as repeated(position)
  join public.station_programs source
    on source.schedule_id = p_schedule_id and source.position = (repeated.position % 2)
  on conflict (schedule_id, position) do update set
    specialty = excluded.specialty,
    journal_id = excluded.journal_id,
    journal_name = excluded.journal_name,
    program_type = excluded.program_type,
    source_program_id = excluded.source_program_id,
    starts_at_offset_minutes = excluded.starts_at_offset_minutes,
    status = excluded.status,
    youtube_video_id = excluded.youtube_video_id,
    youtube_url = excluded.youtube_url,
    title = excluded.title,
    description = excluded.description,
    tags = excluded.tags,
    card_ids = excluded.card_ids,
    writeout_cards = excluded.writeout_cards,
    failure_reason = null,
    updated_at = now();

  if (select count(*) from public.station_programs where schedule_id = p_schedule_id and status = 'verified') <> 6 then
    raise exception 'Weekend station schedule must contain six verified positions.';
  end if;
  update public.station_daily_schedules set status = 'superseded', updated_at = now()
    where status = 'active' and id <> p_schedule_id;
  update public.station_daily_schedules
  set status = 'active', activated_at = now(),
      verification_summary = verification_summary || jsonb_build_object(
        'mode', 'weekend_top_articles',
        'cycle_start', '09:00 America/New_York',
        'new_youtube_videos', 2,
        'replay_positions', 4,
        'weekday_programming_mutated', false
      ),
      updated_at = now()
  where id = p_schedule_id
  returning * into activated;
  return activated;
end;
$$;

revoke all on function public.activate_weekend_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_weekend_station_schedule(uuid) to service_role;