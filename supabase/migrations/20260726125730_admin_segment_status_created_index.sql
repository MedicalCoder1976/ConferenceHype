create index if not exists segments_status_created_at_idx on public.segments (status, created_at desc);
