alter table public.stream_state
  add column if not exists youtube_status text not null default 'not_scheduled',
  add column if not exists youtube_video_id text,
  add column if not exists youtube_url text,
  add column if not exists continuous_enabled boolean not null default false;

alter table public.stream_state
  drop constraint if exists stream_state_youtube_status_check;

alter table public.stream_state
  add constraint stream_state_youtube_status_check
  check (
    youtube_status in (
      'not_scheduled',
      'queued',
      'rendering',
      'live',
      'completed',
      'failed'
    )
  );
