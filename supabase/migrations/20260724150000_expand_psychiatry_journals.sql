-- Expand psychiatry coverage and repair specialty drift in existing rows.
update public.oncology_journals
set specialty = 'Psychiatry', updated_at = now()
where name = 'JAMA Psychiatry';

update public.oncology_journals
set specialty = 'Neurology', updated_at = now()
where name = 'Journal of Neurology, Neurosurgery & Psychiatry';

insert into public.oncology_journals (name, abbreviation, rss_url, official_url, enabled, specialty)
values
  ('American Journal of Psychiatry', 'Am J Psychiatry', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Am+J+Psychiatry%22%5BJournal%5D', 'https://psychiatryonline.org/journal/ajp', true, 'Psychiatry'),
  ('The British Journal of Psychiatry', 'Br J Psychiatry', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Br+J+Psychiatry%22%5BJournal%5D', 'https://www.cambridge.org/core/journals/the-british-journal-of-psychiatry', true, 'Psychiatry'),
  ('Molecular Psychiatry', 'Mol Psychiatry', 'https://feeds.nature.com/mp/rss/current', 'https://www.nature.com/mp/', true, 'Psychiatry'),
  ('World Psychiatry', 'World Psychiatry', 'https://onlinelibrary.wiley.com/feed/20515545/most-recent', 'https://onlinelibrary.wiley.com/journal/20515545', true, 'Psychiatry'),
  ('Psychiatric Services', 'Psychiatr Serv', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Psychiatr+Serv%22%5BJournal%5D', 'https://psychiatryonline.org/journal/ps', true, 'Psychiatry'),
  ('Journal of Child Psychology and Psychiatry', 'J Child Psychol Psychiatry', 'https://acamh.onlinelibrary.wiley.com/feed/14697610/most-recent', 'https://acamh.onlinelibrary.wiley.com/journal/14697610', true, 'Psychiatry')
on conflict (rss_url) do update set
  name = excluded.name,
  abbreviation = excluded.abbreviation,
  official_url = excluded.official_url,
  enabled = true,
  specialty = excluded.specialty,
  updated_at = now();