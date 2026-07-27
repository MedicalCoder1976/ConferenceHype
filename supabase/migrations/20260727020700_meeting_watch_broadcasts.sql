-- Standalone 30-minute "Meeting Watch" broadcasts (any meeting/specialty,
-- admin-curated from a real source URL). Deliberately independent of
-- station_daily_schedules/station_programs -- that system requires a full
-- six-slot day with all six verified before anything airs, which doesn't
-- fit a one-off or few-episode special. This table + its own poller
-- (meeting-watch-broadcast.yml) is the standalone equivalent of the
-- create-then-poll pattern already used by conference_coverage_slots.
create table if not exists public.meeting_watch_broadcasts (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  meeting_label text not null,
  specialty text,
  episode_index integer not null,
  episode_count integer not null,
  title text not null,
  description text not null,
  card_ids uuid[] not null default '{}',
  status text not null default 'planned',
  starts_at timestamptz not null,
  youtube_video_id text,
  youtube_url text,
  failure_reason text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_watch_broadcasts_status_check
    check (status in ('planned', 'rendering', 'uploaded', 'verified', 'failed')),
  constraint meeting_watch_broadcasts_episode_check
    check (episode_index >= 0 and episode_index < episode_count),
  unique (source_url, episode_index)
);

create index if not exists meeting_watch_broadcasts_due_idx
  on public.meeting_watch_broadcasts (status, starts_at);

alter table public.meeting_watch_broadcasts enable row level security;

grant select, insert, update, delete on public.meeting_watch_broadcasts to service_role;

revoke all on public.meeting_watch_broadcasts from anon, authenticated;
