create or replace function public.activate_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql security definer set search_path = public
as $$
declare
  candidate public.station_daily_schedules;
  verified_count integer;
  duplicate_video_count integer;
  repeated_journal_count integer;
  activated public.station_daily_schedules;
begin
  select * into candidate from public.station_daily_schedules where id = p_schedule_id;
  if candidate.id is null then raise exception 'Station schedule not found.'; end if;
  select count(*), count(*) - count(distinct youtube_video_id)
    into verified_count, duplicate_video_count
  from public.station_programs
  where schedule_id = p_schedule_id and status = 'verified' and youtube_video_id is not null;
  if verified_count <> 6 or duplicate_video_count <> 0 then
    raise exception 'All six station programs must be verified with distinct YouTube videos before activation.';
  end if;
  select count(*) into repeated_journal_count
  from public.station_programs candidate_program
  where candidate_program.schedule_id = p_schedule_id and exists (
    select 1 from public.station_programs prior_program
    join public.station_daily_schedules prior_schedule on prior_schedule.id = prior_program.schedule_id
    where prior_schedule.id <> p_schedule_id
      and prior_schedule.schedule_date between candidate.schedule_date - (extract(isodow from candidate.schedule_date)::integer - 1) and candidate.schedule_date + (5 - extract(isodow from candidate.schedule_date)::integer)
      and prior_schedule.status in ('draft','building','verified','active','superseded')
      and prior_program.journal_id = candidate_program.journal_id
  );
  if repeated_journal_count <> 0 then raise exception 'A journal may appear only once in a Monday-Friday programming week.'; end if;
  update public.station_daily_schedules set status='superseded', updated_at=now() where status='active' and id <> p_schedule_id;
  update public.station_daily_schedules
  set status='active', activated_at=now(), verification_summary=verification_summary || jsonb_build_object('mode','new_daily_programming','weekly_unique_journals',true), updated_at=now()
  where id=p_schedule_id returning * into activated;
  return activated;
end;
$$;
revoke all on function public.activate_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_station_schedule(uuid) to service_role;