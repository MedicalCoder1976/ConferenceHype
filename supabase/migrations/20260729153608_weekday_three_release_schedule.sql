create or replace function public.activate_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.station_daily_schedules;
  originals integer;
  distinct_videos integer;
  repeated_journal_count integer;
  activated public.station_daily_schedules;
begin
  select * into candidate from public.station_daily_schedules where id = p_schedule_id;
  if candidate.id is null then raise exception 'Station schedule not found.'; end if;
  if extract(isodow from candidate.schedule_date) not between 1 and 5 then
    raise exception 'Weekday station activation is Monday-Friday only.';
  end if;

  select count(*), count(distinct youtube_video_id)
    into originals, distinct_videos
  from public.station_programs
  where schedule_id = p_schedule_id
    and position in (0, 1, 2)
    and program_type = 'new'
    and status = 'verified'
    and youtube_video_id is not null;
  if originals <> 3 or distinct_videos <> 3 then
    raise exception 'All three weekday programs must be verified with distinct YouTube videos before activation.';
  end if;

  select count(*) into repeated_journal_count
  from public.station_programs candidate_program
  where candidate_program.schedule_id = p_schedule_id
    and candidate_program.program_type = 'new'
    and exists (
      select 1
      from public.station_programs prior_program
      join public.station_daily_schedules prior_schedule on prior_schedule.id = prior_program.schedule_id
      where prior_schedule.id <> p_schedule_id
        and prior_schedule.schedule_date between candidate.schedule_date - (extract(isodow from candidate.schedule_date)::integer - 1)
          and candidate.schedule_date + (5 - extract(isodow from candidate.schedule_date)::integer)
        and prior_schedule.status in ('draft','building','verified','active','superseded')
        and prior_program.program_type = 'new'
        and prior_program.journal_id = candidate_program.journal_id
    );
  if repeated_journal_count <> 0 then
    raise exception 'A journal may appear only once in a Monday-Friday programming week.';
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
    source.journal_id,
    source.journal_name,
    'journal_replay',
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
  from generate_series(3, 5) as repeated(position)
  join public.station_programs source
    on source.schedule_id = p_schedule_id and source.position = (repeated.position - 3)
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
    raise exception 'Weekday station schedule must contain three releases and three verified replay positions.';
  end if;

  update public.station_daily_schedules set status = 'superseded', updated_at = now()
    where status = 'active' and id <> p_schedule_id;
  update public.station_daily_schedules
  set status = 'active', activated_at = now(),
      verification_summary = verification_summary || jsonb_build_object(
        'mode', 'three_daily_journal_releases',
        'youtube_release_times_eastern', jsonb_build_array('07:15', '17:10', '20:45'),
        'new_youtube_videos', 3,
        'replay_positions', 3,
        'unused_cards_preserved', true,
        'weekly_unique_journals', true
      ),
      updated_at = now()
  where id = p_schedule_id
  returning * into activated;
  return activated;
end;
$$;

revoke all on function public.activate_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_station_schedule(uuid) to service_role;
