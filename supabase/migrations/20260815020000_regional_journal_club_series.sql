alter table public.oncology_journals
  add column if not exists regional_only boolean not null default false;

create table if not exists public.journal_series (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('india', 'united_kingdom')),
  display_name text not null,
  country_code text not null check (country_code in ('IN', 'GB')),
  timezone text not null,
  release_days smallint[] not null,
  release_local_time time not null,
  minimum_cards int not null default 12 check (minimum_cards >= 12),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_series_memberships (
  series_id uuid not null references public.journal_series(id) on delete cascade,
  journal_id uuid not null references public.oncology_journals(id) on delete cascade,
  priority int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (series_id, journal_id)
);

create table if not exists public.regional_journal_programs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.journal_series(id) on delete restrict,
  release_date date not null,
  starts_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned', 'shadow_verified', 'rendering', 'verified', 'failed', 'cancelled')),
  card_ids uuid[] not null default '{}',
  journal_ids uuid[] not null default '{}',
  specialties text[] not null default '{}',
  title text,
  description text,
  tags text[] not null default '{}',
  youtube_video_id text,
  youtube_url text,
  writeout_cards jsonb not null default '[]'::jsonb,
  failure_reason text,
  workflow_run_id text,
  workflow_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, release_date)
);

create index if not exists journal_series_memberships_journal_idx
  on public.journal_series_memberships(journal_id) where enabled;
create index if not exists regional_journal_programs_status_starts_idx
  on public.regional_journal_programs(status, starts_at);

alter table public.journal_series enable row level security;
alter table public.journal_series_memberships enable row level security;
alter table public.regional_journal_programs enable row level security;

revoke all on public.journal_series from anon, authenticated;
revoke all on public.journal_series_memberships from anon, authenticated;
revoke all on public.regional_journal_programs from anon, authenticated;
grant all on public.journal_series to service_role;
grant all on public.journal_series_memberships to service_role;
grant all on public.regional_journal_programs to service_role;

insert into public.journal_series
  (code, display_name, country_code, timezone, release_days, release_local_time, minimum_cards, enabled)
values
  ('india', 'INDIA JOURNAL ARTICLES', 'IN', 'Asia/Kolkata', array[2,5]::smallint[], '19:30', 12, false),
  ('united_kingdom', 'UNITED KINGDOM JOURNAL ARTICLES', 'GB', 'Europe/London', array[3,7]::smallint[], '18:30', 12, false)
on conflict (code) do update set
  display_name = excluded.display_name,
  country_code = excluded.country_code,
  timezone = excluded.timezone,
  release_days = excluded.release_days,
  release_local_time = excluded.release_local_time,
  minimum_cards = excluded.minimum_cards,
  updated_at = now();
