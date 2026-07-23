create table if not exists public.station_daily_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null unique,
  timezone text not null default 'America/New_York',
  status text not null default 'draft',
  cycle_start_minutes integer not null default 0,
  verification_summary jsonb not null default '{}'::jsonb,
  previous_schedule_id uuid references public.station_daily_schedules(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_daily_schedules_status_check
    check (status in ('draft', 'building', 'verified', 'active', 'failed', 'superseded')),
  constraint station_daily_schedules_cycle_start_check
    check (cycle_start_minutes >= 0 and cycle_start_minutes < 1440)
);

create table if not exists public.station_programs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.station_daily_schedules(id) on delete cascade,
  position integer not null,
  specialty text not null,
  journal_id uuid references public.oncology_journals(id) on delete set null,
  journal_name text not null,
  program_type text not null default 'new',
  source_program_id uuid references public.station_programs(id) on delete set null,
  starts_at_offset_minutes integer not null,
  duration_minutes integer not null default 30,
  status text not null default 'planned',
  youtube_video_id text,
  youtube_url text,
  title text,
  description text,
  tags text[] not null default '{}',
  card_ids uuid[] not null default '{}',
  writeout_cards jsonb not null default '[]'::jsonb,
  render_checksum text,
  failure_reason text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_programs_position_check check (position between 0 and 5),
  constraint station_programs_offset_check check (starts_at_offset_minutes between 0 and 150),
  constraint station_programs_duration_check check (duration_minutes = 30),
  constraint station_programs_type_check
    check (program_type in ('new', 'journal_replay', 'specialty_replay', 'fallback')),
  constraint station_programs_status_check
    check (status in ('planned', 'reserved', 'rendering', 'uploaded', 'verified', 'failed')),
  unique (schedule_id, position)
);

create table if not exists public.station_breakins (
  id uuid primary key default gen_random_uuid(),
  target_at timestamptz not null,
  placement text not null,
  duration_minutes integer not null default 15,
  title text not null,
  summary text not null,
  script text not null,
  specialty text,
  source_label text not null,
  source_url text not null,
  segment_id uuid references public.segments(id) on delete set null,
  status text not null default 'approved',
  youtube_video_id text,
  youtube_url text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_breakins_placement_check check (placement in ('top', 'bottom')),
  constraint station_breakins_duration_check check (duration_minutes = 15),
  constraint station_breakins_status_check
    check (status in ('approved', 'rendering', 'verified', 'failed', 'cancelled')),
  unique (target_at)
);

create index if not exists station_daily_schedules_status_date_idx
  on public.station_daily_schedules (status, schedule_date desc);
create index if not exists station_programs_schedule_position_idx
  on public.station_programs (schedule_id, position);
create index if not exists station_programs_replay_lookup_idx
  on public.station_programs (journal_id, specialty, status, updated_at desc);
create index if not exists station_breakins_target_status_idx
  on public.station_breakins (target_at, status);

alter table public.station_daily_schedules enable row level security;
alter table public.station_programs enable row level security;
alter table public.station_breakins enable row level security;

grant select, insert, update, delete on public.station_daily_schedules to service_role;
grant select, insert, update, delete on public.station_programs to service_role;
grant select, insert, update, delete on public.station_breakins to service_role;

revoke all on public.station_daily_schedules from anon, authenticated;
revoke all on public.station_programs from anon, authenticated;
revoke all on public.station_breakins from anon, authenticated;

create or replace function public.activate_station_schedule(p_schedule_id uuid)
returns public.station_daily_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_count integer;
  activated public.station_daily_schedules;
begin
  select count(*) into verified_count
  from public.station_programs
  where schedule_id = p_schedule_id and status = 'verified';
  if verified_count <> 6 then
    raise exception 'All six station programs must be verified before activation.';
  end if;

  update public.station_daily_schedules
  set status = 'superseded', updated_at = now()
  where status = 'active' and id <> p_schedule_id;

  update public.station_daily_schedules
  set status = 'active', activated_at = now(), updated_at = now()
  where id = p_schedule_id
  returning * into activated;
  if activated.id is null then raise exception 'Station schedule not found.'; end if;
  return activated;
end;
$$;

revoke all on function public.activate_station_schedule(uuid) from public, anon, authenticated;
grant execute on function public.activate_station_schedule(uuid) to service_role;
