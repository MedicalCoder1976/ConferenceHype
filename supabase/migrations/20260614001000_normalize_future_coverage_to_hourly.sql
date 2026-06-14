insert into public.conference_coverage_slots (
  conference_id,
  starts_at,
  duration_hours,
  enabled,
  approval_status,
  approved_at,
  approval_scope,
  youtube_status,
  created_at,
  updated_at
)
select
  slot.conference_id,
  slot.starts_at + make_interval(hours => offset_hour),
  1,
  slot.enabled,
  slot.approval_status,
  slot.approved_at,
  slot.approval_scope,
  'not_scheduled',
  now(),
  now()
from public.conference_coverage_slots slot
cross join generate_series(1, 2) as offset_hour
where slot.duration_hours = 3
  and slot.starts_at >= date_trunc('hour', now())
  and slot.youtube_status not in ('live', 'completed')
on conflict (conference_id, starts_at) do update
set
  duration_hours = 1,
  enabled = excluded.enabled,
  updated_at = now();

update public.conference_coverage_slots
set duration_hours = 1,
    updated_at = now()
where duration_hours = 3
  and starts_at >= date_trunc('hour', now())
  and youtube_status not in ('live', 'completed');
