update public.conference_coverage_slots
set duration_hours = 1,
    updated_at = now()
where duration_hours <> 1;

alter table public.conference_coverage_slots
  drop constraint if exists conference_coverage_slots_duration_hours_check;

alter table public.conference_coverage_slots
  add constraint conference_coverage_slots_duration_hours_check
    check (duration_hours = 1);

create table if not exists public.broadcast_writeouts (
  id uuid primary key default gen_random_uuid(),
  coverage_slot_id uuid unique references public.conference_coverage_slots(id) on delete set null,
  starts_at timestamptz not null unique,
  duration_minutes integer not null default 60 check (duration_minutes = 60),
  title text not null,
  status text not null default 'rendering'
    check (status in ('not_scheduled', 'queued', 'rendering', 'live', 'completed', 'failed')),
  youtube_video_id text,
  youtube_url text,
  workflow_run_id text,
  workflow_url text,
  delivery_error text,
  cards jsonb not null default '[]'::jsonb,
  writeout_markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcast_writeouts_starts_at_idx
  on public.broadcast_writeouts (starts_at desc);

alter table public.broadcast_writeouts enable row level security;

grant select, insert, update, delete on public.broadcast_writeouts to service_role;
