-- Korean dub button (conferencehype.com/admin): tracks an optional, on-demand
-- Korean-audio re-render of an already-published conference-coverage
-- broadcast. Lives on broadcast_writeouts because that table is the one
-- place that persists a broadcast's full per-card script trail -- other
-- broadcast types (journal/weekend/regional/meeting watch) don't retain a
-- final assembled script and are out of scope for v1.
alter table public.broadcast_writeouts
  add column if not exists korean_dub_status text not null default 'none',
  add column if not exists korean_youtube_video_id text,
  add column if not exists korean_youtube_url text,
  add column if not exists korean_dub_error text;

alter table public.broadcast_writeouts
  drop constraint if exists broadcast_writeouts_korean_dub_status_check;

alter table public.broadcast_writeouts
  add constraint broadcast_writeouts_korean_dub_status_check
  check (korean_dub_status in ('none', 'pending', 'processing', 'done', 'failed'));
