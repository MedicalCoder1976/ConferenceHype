create table if not exists public.daily_coverage_plans (
  id uuid primary key default gen_random_uuid(),
  coverage_date date not null unique,
  conference_ids uuid[] not null default '{}',
  journal_ids uuid[] not null default '{}',
  source_ids uuid[] not null default '{}',
  custom_items jsonb not null default '[]'::jsonb,
  priority_topics text[] not null default '{}',
  exclusions text[] not null default '{}',
  breaking_news_enabled boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_coverage_plans_date_idx
  on public.daily_coverage_plans (coverage_date desc);

alter table public.daily_coverage_plans enable row level security;

create policy "authenticated admins can manage daily coverage plans"
  on public.daily_coverage_plans for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

grant select, insert, update, delete on public.daily_coverage_plans
  to authenticated, service_role;
