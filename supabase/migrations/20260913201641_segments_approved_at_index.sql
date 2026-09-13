-- getNextBroadcastSegmentsFromDb and getBroadcastSegmentsByRiskFlagFromDb
-- filter status='approved' and order by (approved_at, created_at), but the
-- only existing index (segments_status_created_at_idx) covers
-- (status, created_at) -- a different sort key. With approved past 15,000
-- rows this forces a full-table sort on every /admin render: confirmed live
-- 2026-09-13 at 4.7s for a single LIMIT-200 call, and as the direct cause of
-- repeated 57014 statement timeouts on /admin even in isolation, after the
-- two segments-paging fixes earlier the same day.
create index if not exists segments_status_approved_at_idx
  on public.segments (status, approved_at desc, created_at asc);

-- getAiredSegmentsFromDb filters status='rendered' ordered by
-- (updated_at, created_at) -- same mismatch against the created_at-only
-- index, added preemptively since rendered will keep growing the same way
-- approved just did.
create index if not exists segments_status_updated_at_idx
  on public.segments (status, updated_at desc, created_at desc);
