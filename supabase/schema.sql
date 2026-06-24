create extension if not exists pgcrypto;

create type source_type as enum (
  'official',
  'media',
  'company',
  'verified_social',
  'general_social',
  'manual'
);

create type content_type as enum (
  'agenda_preview',
  'abstract_buzz',
  'media_roundup',
  'social_signal',
  'industry_floor',
  'market_watch',
  'patient_lens',
  'hype_clip'
);

create type segment_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'rendered'
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  type source_type not null,
  rank int not null default 5,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ingested_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  url text not null,
  excerpt text not null default '',
  author text,
  source_type source_type not null,
  source_rank int not null default 5,
  dedupe_hash text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  script text not null,
  content_type content_type not null,
  persona_id text not null,
  persona_name text not null,
  hype_level text not null default 'standard',
  language text not null default 'English',
  status segment_status not null default 'pending_review',
  citations jsonb not null default '[]',
  social_buzz_items jsonb not null default '[]',
  risk_flags text[] not null default '{}',
  confidence_score int not null default 0,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid references public.segments(id) on delete cascade,
  kind text not null,
  storage_path text,
  status text not null default 'queued',
  duration_seconds int,
  created_at timestamptz not null default now()
);

create table public.stream_state (
  id int primary key default 1 check (id = 1),
  mode text not null default 'preview',
  emergency_active boolean not null default false,
  emergency_message text not null default 'ConferenceHype automation is paused while the operator desk reviews the queue.',
  current_segment_id uuid references public.segments(id),
  youtube_status text not null default 'not_scheduled',
  youtube_video_id text,
  youtube_url text,
  continuous_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  segment_id uuid references public.segments(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.specialty_x_voices (
  id uuid primary key default gen_random_uuid(),
  specialty text not null,
  label text not null,
  handle text not null,
  note text not null default '',
  enabled boolean not null default true,
  rank int not null default 20 check (rank between 1 and 20),
  score int not null default 0,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (specialty, handle)
);

create table public.medical_conferences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acronym text,
  specialties text[] not null default '{}',
  start_date date,
  end_date date,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2020 and 2100),
  city text,
  country text,
  timezone text not null default 'America/New_York',
  official_url text not null,
  enabled boolean not null default true,
  operator_added boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, year)
);

create table public.conference_coverage_slots (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.medical_conferences(id) on delete cascade,
  starts_at timestamptz not null,
  duration_hours int not null default 1 check (duration_hours between 1 and 24),
  enabled boolean not null default true,
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'approved', 'rejected')),
  approved_at timestamptz,
  approval_scope text check (approval_scope in ('slot', 'day', 'week')),
  youtube_status text not null default 'not_scheduled'
    check (youtube_status in ('not_scheduled', 'queued', 'rendering', 'live', 'completed', 'failed')),
  youtube_video_id text,
  youtube_url text,
  workflow_run_id text,
  workflow_url text,
  stream_started_at timestamptz,
  stream_ended_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_id, starts_at)
);

create table public.oncology_journals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null,
  rss_url text not null unique,
  official_url text not null,
  enabled boolean not null default true,
  last_issue_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editorial_packages (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('journal_watch', 'meeting_watch')),
  title text not null,
  subject_name text not null,
  edition_key text not null,
  source_url text not null,
  event_date date,
  intro_script text not null,
  sections jsonb not null default '[]',
  status text not null default 'memory' check (status in ('memory', 'scheduled')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, edition_key)
);

create table public.daily_coverage_plans (
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

create table public.platform_smoke_runs (
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

create index if not exists ingested_items_source_id_idx
  on public.ingested_items (source_id);

create index if not exists segments_approved_by_idx
  on public.segments (approved_by);

create index if not exists media_assets_segment_id_idx
  on public.media_assets (segment_id);

create index if not exists stream_state_current_segment_id_idx
  on public.stream_state (current_segment_id);

create index if not exists analytics_events_segment_id_idx
  on public.analytics_events (segment_id);
create index if not exists specialty_x_voices_specialty_rank_idx
  on public.specialty_x_voices (specialty, enabled, rank);
create index if not exists medical_conferences_month_year_idx
  on public.medical_conferences (year, month, enabled);
create index if not exists conference_coverage_slots_starts_at_idx
  on public.conference_coverage_slots (starts_at, enabled);
create index if not exists conference_coverage_slots_publish_queue_idx
  on public.conference_coverage_slots (approval_status, youtube_status, starts_at)
  where enabled = true;
create index if not exists editorial_packages_category_created_idx
  on public.editorial_packages (category, created_at desc);
create index if not exists daily_coverage_plans_date_idx
  on public.daily_coverage_plans (coverage_date desc);
create index if not exists platform_smoke_runs_started_at_idx
  on public.platform_smoke_runs (started_at desc);

insert into public.stream_state (id) values (1) on conflict (id) do nothing;

alter table public.sources enable row level security;
alter table public.ingested_items enable row level security;
alter table public.segments enable row level security;
alter table public.media_assets enable row level security;
alter table public.stream_state enable row level security;
alter table public.analytics_events enable row level security;
alter table public.specialty_x_voices enable row level security;
alter table public.medical_conferences enable row level security;
alter table public.conference_coverage_slots enable row level security;
alter table public.oncology_journals enable row level security;
alter table public.editorial_packages enable row level security;
alter table public.daily_coverage_plans enable row level security;
alter table public.platform_smoke_runs enable row level security;

create policy "public can read approved segments"
  on public.segments for select
  to anon
  using (status in ('approved', 'rendered'));

create policy "authenticated admins can manage segments"
  on public.segments for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage sources"
  on public.sources for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage stream state"
  on public.stream_state for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage ingested items"
  on public.ingested_items for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage media assets"
  on public.media_assets for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "public can insert analytics"
  on public.analytics_events for insert
  to anon, authenticated
  with check (
    char_length(event_name) between 1 and 80
    and jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 4096
  );

create policy "authenticated admins can manage specialty voices"
  on public.specialty_x_voices for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage medical conferences"
  on public.medical_conferences for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage conference coverage"
  on public.conference_coverage_slots for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage oncology journals"
  on public.oncology_journals for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage editorial packages"
  on public.editorial_packages for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage daily coverage plans"
  on public.daily_coverage_plans for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

create policy "authenticated admins can manage platform smoke runs"
  on public.platform_smoke_runs for all
  to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

grant select, insert, update, delete on public.platform_smoke_runs
  to authenticated, service_role;

create or replace function public.replace_broadcast_segment(
  p_target_segment_id uuid,
  p_replacement_segment_id uuid,
  p_slot_at timestamptz,
  p_script text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  replacement_row public.segments;
begin
  if p_target_segment_id is not null and p_target_segment_id <> p_replacement_segment_id then
    update public.segments
      set status = 'pending_review',
          approved_at = null,
          updated_at = now()
      where id = p_target_segment_id;
  end if;

  update public.segments
    set script = p_script,
        status = 'approved',
        approved_at = p_slot_at,
        updated_at = now()
    where id = p_replacement_segment_id
    returning * into replacement_row;

  if replacement_row.id is null then
    raise exception 'Replacement segment not found';
  end if;

  return to_jsonb(replacement_row);
end;
$$;

revoke all on function public.replace_broadcast_segment(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.replace_broadcast_segment(uuid, uuid, timestamptz, text)
  to service_role;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
