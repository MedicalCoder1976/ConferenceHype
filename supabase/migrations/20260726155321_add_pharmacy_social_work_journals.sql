-- Catalog-only expansion. These journals stay disabled so this migration
-- cannot alter station selection, journal slots, or the public player.
insert into public.oncology_journals (
  name, abbreviation, rss_url, official_url, enabled, specialty
)
values
  ('American Journal of Health-System Pharmacy', 'Am J Health Syst Pharm', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Am+J+Health+Syst+Pharm%22%5BJournal%5D', 'https://academic.oup.com/ajhp', false, 'Pharmacy'),
  ('Pharmacotherapy', 'Pharmacotherapy', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Pharmacotherapy%22%5BJournal%5D', 'https://accpjournals.onlinelibrary.wiley.com/journal/18759114', false, 'Pharmacy'),
  ('Journal of the American Pharmacists Association', 'J Am Pharm Assoc (2003)', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22J+Am+Pharm+Assoc+%282003%29%22%5BJournal%5D', 'https://www.japha.org/', false, 'Pharmacy'),
  ('Annals of Pharmacotherapy', 'Ann Pharmacother', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Ann+Pharmacother%22%5BJournal%5D', 'https://journals.sagepub.com/home/aop', false, 'Pharmacy'),
  ('Research in Social and Administrative Pharmacy', 'Res Social Adm Pharm', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Res+Social+Adm+Pharm%22%5BJournal%5D', 'https://www.sciencedirect.com/journal/research-in-social-and-administrative-pharmacy', false, 'Pharmacy'),
  ('Social Work in Health Care', 'Soc Work Health Care', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Soc+Work+Health+Care%22%5BJournal%5D', 'https://www.tandfonline.com/journals/wshc20', false, 'Social Work'),
  ('Health & Social Work', 'Health Soc Work', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Health+Soc+Work%22%5BJournal%5D', 'https://academic.oup.com/hsw', false, 'Social Work'),
  ('Social Work', 'Soc Work', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Soc+Work%22%5BJournal%5D', 'https://academic.oup.com/sw', false, 'Social Work'),
  ('Social Work in Public Health', 'Soc Work Public Health', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22Soc+Work+Public+Health%22%5BJournal%5D', 'https://www.tandfonline.com/journals/whsp20', false, 'Social Work'),
  ('Journal of Social Work in End-of-Life & Palliative Care', 'J Soc Work End Life Palliat Care', 'https://pubmed.ncbi.nlm.nih.gov/?term=%22J+Soc+Work+End+Life+Palliat+Care%22%5BJournal%5D', 'https://www.tandfonline.com/journals/wswe20', false, 'Social Work')
on conflict (rss_url) do update set
  name = excluded.name,
  abbreviation = excluded.abbreviation,
  official_url = excluded.official_url,
  specialty = excluded.specialty,
  enabled = public.oncology_journals.enabled,
  updated_at = now();
