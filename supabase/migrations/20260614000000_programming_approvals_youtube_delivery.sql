alter table public.conference_coverage_slots
  drop constraint if exists conference_coverage_slots_duration_hours_check;

alter table public.conference_coverage_slots
  alter column duration_hours set default 1,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_at timestamptz,
  add column if not exists approval_scope text,
  add column if not exists youtube_status text not null default 'not_scheduled',
  add column if not exists youtube_video_id text,
  add column if not exists youtube_url text,
  add column if not exists workflow_run_id text,
  add column if not exists workflow_url text,
  add column if not exists stream_started_at timestamptz,
  add column if not exists stream_ended_at timestamptz,
  add column if not exists delivery_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.conference_coverage_slots
  add constraint conference_coverage_slots_duration_hours_check
    check (duration_hours between 1 and 24),
  add constraint conference_coverage_slots_approval_status_check
    check (approval_status in ('draft', 'approved', 'rejected')),
  add constraint conference_coverage_slots_approval_scope_check
    check (approval_scope is null or approval_scope in ('slot', 'day', 'week')),
  add constraint conference_coverage_slots_youtube_status_check
    check (youtube_status in ('not_scheduled', 'queued', 'rendering', 'live', 'completed', 'failed'));

create index if not exists conference_coverage_slots_publish_queue_idx
  on public.conference_coverage_slots (approval_status, youtube_status, starts_at)
  where enabled = true;
