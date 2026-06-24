create table if not exists public.platform_smoke_runs (
  id uuid primary key default gen_random_uuid(),
  attempt int not null default 1,
  attempts_allowed int not null default 1,
  outcome text not null default 'running'
    check (outcome in ('running', 'passed', 'failed')),
  conference_name text,
  journal_name text,
  source_name text,
  workflow_run_url text,
  error_message text,
  fix_deployed_at timestamptz,
  fix_notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_smoke_runs_started_at_idx
  on public.platform_smoke_runs (started_at desc);

alter table public.platform_smoke_runs enable row level security;

create policy "authenticated admins can manage platform smoke runs"
  on public.platform_smoke_runs for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

grant select, insert, update, delete on public.platform_smoke_runs
  to authenticated, service_role;
