-- PubMed can assign the same DOI to multiple related PMID records.
-- PMID remains the ledger identity; DOI is lookup-only.
drop index if exists public.journal_articles_doi_idx;
create index if not exists journal_articles_doi_idx
  on public.journal_articles (journal_id, lower(doi))
  where doi is not null and doi <> '';
