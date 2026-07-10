alter table public.oncology_journals
  add column if not exists specialty text;

comment on column public.oncology_journals.specialty is
  'Journal-watch specialty tab grouping (see lib/catalog/journalWatchSpecialties.ts). Null or an unrecognized value falls back to "Others" in the admin UI.';
