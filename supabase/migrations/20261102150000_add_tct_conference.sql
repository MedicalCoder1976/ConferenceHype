-- 2026-11-02: operator added TCT to the conferences to be covered.
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
values (
  'Transcatheter Cardiovascular Therapeutics',
  'TCT',
  array['Cardiology'],
  '2026-10-31',
  '2026-11-03',
  10,
  2026,
  'San Diego',
  'United States',
  'America/Los_Angeles',
  'https://www.tctconference.com',
  true,
  true
)
on conflict (name, year) do update
set
  acronym = excluded.acronym,
  specialties = excluded.specialties,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  city = excluded.city,
  country = excluded.country,
  timezone = excluded.timezone,
  official_url = excluded.official_url,
  enabled = true,
  updated_at = now();
