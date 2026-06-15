insert into public.oncology_journals (
  name,
  abbreviation,
  rss_url,
  official_url,
  enabled
)
values
  (
    'Nature Cancer',
    'Nature Cancer',
    'https://www.nature.com/natcancer.rss',
    'https://www.nature.com/natcancer/',
    true
  ),
  (
    'British Journal of Cancer',
    'BJC',
    'https://www.nature.com/bjc.rss',
    'https://www.nature.com/bjc/',
    true
  ),
  (
    'Leukemia',
    'Leukemia',
    'https://www.nature.com/leu.rss',
    'https://www.nature.com/leu/',
    true
  ),
  (
    'Blood Cancer Journal',
    'BCJ',
    'https://www.nature.com/bcj.rss',
    'https://www.nature.com/bcj/',
    true
  )
on conflict (rss_url) do update
set
  name = excluded.name,
  abbreviation = excluded.abbreviation,
  official_url = excluded.official_url,
  enabled = true,
  updated_at = now();

update public.oncology_journals
set enabled = false,
    updated_at = now()
where rss_url = 'https://feeds.bmj.com/bmj/recent';

insert into public.medical_conferences (
  name,
  acronym,
  specialties,
  month,
  year,
  timezone,
  official_url,
  enabled,
  operator_added
)
values
  ('EBMT Annual Meeting', 'EBMT', array['Hematology', 'Oncology'], 4, 2026, 'Europe/Paris', 'https://www.ebmt.org/annual-meeting', true, false),
  ('ASTRO Annual Meeting', 'ASTRO', array['Oncology', 'Radiology'], 9, 2026, 'America/New_York', 'https://www.astro.org/meetings-and-education/annual-meeting', true, false),
  ('International Society of Geriatric Oncology Annual Conference', 'SIOG', array['Oncology', 'Geriatrics'], 11, 2026, 'Europe/Paris', 'https://siog.org/events/annual-conference/', true, false),
  ('Society for Immunotherapy of Cancer Annual Meeting', 'SITC', array['Oncology', 'Immunology'], 11, 2026, 'America/New_York', 'https://www.sitcancer.org/education/annual-meeting', true, false),
  ('San Antonio Breast Cancer Symposium', 'SABCS', array['Oncology'], 12, 2026, 'America/Chicago', 'https://www.sabcs.org/', true, false)
on conflict (name, year) do update
set
  acronym = excluded.acronym,
  specialties = excluded.specialties,
  month = excluded.month,
  timezone = excluded.timezone,
  official_url = excluded.official_url,
  enabled = true,
  updated_at = now();
