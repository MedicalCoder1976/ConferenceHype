insert into public.oncology_journals (
  name,
  abbreviation,
  rss_url,
  official_url,
  enabled
)
values
  (
    'Journal of Clinical Oncology',
    'JCO',
    'https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=jco',
    'https://ascopubs.org/journal/jco',
    true
  )
on conflict (rss_url) do update
set
  name = excluded.name,
  abbreviation = excluded.abbreviation,
  official_url = excluded.official_url,
  enabled = true,
  updated_at = now();

insert into public.medical_conferences (
  name,
  acronym,
  specialties,
  start_date,
  end_date,
  month,
  year,
  city,
  country,
  timezone,
  official_url,
  enabled,
  operator_added
)
values
  (
    'American Society of Clinical Oncology Annual Meeting',
    'ASCO',
    array['Oncology'],
    '2026-05-29',
    '2026-06-02',
    5,
    2026,
    'Chicago',
    'United States',
    'America/Chicago',
    'https://meetings.asco.org/am/attend',
    true,
    false
  ),
  (
    'American Society of Hematology Annual Meeting',
    'ASH',
    array['Hematology', 'Oncology'],
    '2026-12-05',
    '2026-12-08',
    12,
    2026,
    'San Diego',
    'United States',
    'America/Los_Angeles',
    'https://www.hematology.org/meetings/annual-meeting',
    true,
    false
  )
on conflict (name, year) do update
set
  acronym = excluded.acronym,
  specialties = excluded.specialties,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  month = excluded.month,
  city = excluded.city,
  country = excluded.country,
  timezone = excluded.timezone,
  official_url = excluded.official_url,
  enabled = true,
  operator_added = false,
  updated_at = now();

insert into public.sources (
  id,
  name,
  url,
  type,
  rank,
  enabled
)
values
  (
    gen_random_uuid(),
    'Journal of Clinical Oncology',
    'https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=jco',
    'media',
    1,
    true
  )
on conflict (url) do update
set
  name = excluded.name,
  type = excluded.type,
  rank = excluded.rank,
  enabled = true;
