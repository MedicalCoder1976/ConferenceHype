-- Ordinary Meeting Watch episodes remain unique by source URL and episode.
-- Prepared Stories use source_hash for deduplication, so a deliberate title or
-- packaging change can generate a new video from the same primary source.
alter table public.meeting_watch_broadcasts
  drop constraint if exists meeting_watch_broadcasts_source_url_episode_index_key;

create unique index if not exists meeting_watch_standard_source_episode_uidx
  on public.meeting_watch_broadcasts (source_url, episode_index)
  where prepared_narrative = false;
