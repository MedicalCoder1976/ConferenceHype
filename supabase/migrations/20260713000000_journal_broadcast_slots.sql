create table if not exists public.journal_broadcast_slots (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.oncology_journals(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes = 30),
  enabled boolean not null default true,
  approval_status text not null default 'approved'
    check (approval_status in ('draft', 'approved', 'rejected')),
  approved_at timestamptz,
  approval_scope text check (approval_scope is null or approval_scope in ('slot', 'day', 'week')),
  youtube_status text not null default 'not_scheduled'
    check (youtube_status in ('not_scheduled', 'queued', 'rendering', 'live', 'completed', 'failed')),
  youtube_video_id text,
  youtube_url text,
  workflow_run_id text,
  workflow_url text,
  stream_started_at timestamptz,
  stream_ended_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journal_id, starts_at)
);

create index if not exists journal_broadcast_slots_starts_at_idx
  on public.journal_broadcast_slots (starts_at, enabled);
create index if not exists journal_broadcast_slots_publish_queue_idx
  on public.journal_broadcast_slots (approval_status, youtube_status, starts_at)
  where enabled = true;

alter table public.journal_broadcast_slots enable row level security;

create policy "authenticated admins can manage journal broadcast slots"
  on public.journal_broadcast_slots for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
