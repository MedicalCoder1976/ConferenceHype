-- Public "Request coverage" form (conferencehype.com/request-coverage,
-- 2026-10-27). Visitors ask ConferenceHype to cover a conference. Rows are
-- written only by the server route with the service role; RLS is on with no
-- policies, so the anon key can neither read nor write requester emails.
create table if not exists public.coverage_requests (
  id uuid primary key default gen_random_uuid(),
  conference_name text not null,
  field text not null,
  specialty text,
  start_date date,
  end_date date,
  location text,
  website_url text not null,
  program_url text,
  requester_name text not null,
  requester_email text not null,
  requester_role text,
  note text,
  consent boolean not null default false,
  ip_hash text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_requests_status_check
    check (status in ('new', 'contacted', 'accepted', 'declined'))
);

create index if not exists coverage_requests_status_created_idx
  on public.coverage_requests (status, created_at desc);

create index if not exists coverage_requests_ip_created_idx
  on public.coverage_requests (ip_hash, created_at desc);

alter table public.coverage_requests enable row level security;
