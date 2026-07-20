-- Additive shadow ledger for PubMed-first journal completeness and card quality.
-- Existing segments and the completed-video delivery path are intentionally unchanged.
create table if not exists public.journal_articles (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.oncology_journals(id) on delete cascade,
  pmid text not null,
  doi text,
  title text not null,
  publication_date text,
  publication_types text[] not null default '{}',
  abstract_text text not null default '',
  abstract_structure jsonb not null default '{}',
  source_url text not null,
  discovered_via text not null default 'pubmed'
    check (discovered_via in ('pubmed', 'rss_reconciliation')),
  eligibility_status text not null default 'discovered'
    check (eligibility_status in (
      'discovered', 'eligible', 'card_created', 'awaiting_abstract',
      'excluded_erratum', 'excluded_retraction', 'excluded_title_only',
      'excluded_insufficient_content', 'quality_failed', 'operator_rejected',
      'reconciled_pubmed'
    )),
  eligibility_reason text not null default '',
  quality_report jsonb not null default '{}',
  reconciled_pmid text,
  card_segment_id uuid references public.segments(id) on delete set null,
  card_builder_version text not null default 'journal-card-v2',
  quality_version text not null default 'journal-quality-v1',
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journal_id, pmid)
);

create table if not exists public.journal_article_sync_state (
  journal_id uuid primary key references public.oncology_journals(id) on delete cascade,
  status text not null default 'never_run'
    check (status in ('never_run', 'running', 'complete', 'complete_with_warnings', 'failed')),
  window_start date,
  last_completed_at timestamptz,
  articles_found int not null default 0,
  cards_eligible int not null default 0,
  cards_created int not null default 0,
  awaiting_abstract int not null default 0,
  excluded int not null default 0,
  rss_items_found int not null default 0,
  rss_unmatched int not null default 0,
  error_message text,
  updated_at timestamptz not null default now()
);
create index if not exists journal_articles_journal_status_idx
  on public.journal_articles (journal_id, eligibility_status);
create index if not exists journal_articles_card_segment_idx
  on public.journal_articles (card_segment_id)
  where card_segment_id is not null;
create index if not exists journal_articles_doi_idx
  on public.journal_articles (journal_id, lower(doi))
  where doi is not null and doi <> '';

grant select, insert, update, delete on public.journal_articles to service_role;
grant select, insert, update, delete on public.journal_article_sync_state to service_role;
revoke all on public.journal_articles from anon, authenticated;
revoke all on public.journal_article_sync_state from anon, authenticated;

alter table public.journal_articles enable row level security;
alter table public.journal_article_sync_state enable row level security;
-- No anon/authenticated policy is created. Server-side service-role operations
-- are the only allowed access until an explicitly authorized admin endpoint is
-- reviewed and enabled.