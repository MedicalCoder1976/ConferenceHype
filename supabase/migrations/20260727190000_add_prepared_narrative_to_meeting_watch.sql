alter table public.meeting_watch_broadcasts
  add column if not exists duration_seconds integer not null default 1800,
  add column if not exists source_hash text,
  add column if not exists prepared_narrative boolean not null default false;

do $$ begin
  alter table public.meeting_watch_broadcasts add constraint meeting_watch_duration_seconds_check check (duration_seconds between 300 and 7200);
exception when duplicate_object then null; end $$;
create unique index if not exists meeting_watch_source_hash_uidx on public.meeting_watch_broadcasts(source_hash) where source_hash is not null;

create or replace function public.create_prepared_meeting_watch(payload jsonb)
returns public.meeting_watch_broadcasts
language plpgsql security invoker set search_path = public
as $$
declare existing public.meeting_watch_broadcasts; created public.meeting_watch_broadcasts; segment_ids uuid[] := '{}'; item jsonb; new_segment_id uuid;
begin
  select * into existing from public.meeting_watch_broadcasts where source_hash = payload->>'source_hash' limit 1;
  if found then return existing; end if;
  for item in select value from jsonb_array_elements(payload->'segments') loop
    insert into public.segments(title,summary,script,content_type,persona_id,persona_name,hype_level,language,status,citations,social_buzz_items,risk_flags,confidence_score,approved_at,created_at,updated_at)
    values(item->>'title',item->>'summary',item->>'script',(item->>'content_type')::content_type,item->>'persona_id',item->>'persona_name',item->>'hype_level',coalesce(item->>'language','English'),'approved'::segment_status,coalesce(item->'citations','[]'::jsonb),coalesce(item->'social_buzz_items','[]'::jsonb),array(select jsonb_array_elements_text(coalesce(item->'risk_flags','[]'::jsonb))),coalesce((item->>'confidence_score')::integer,95),now(),now(),now()) returning id into new_segment_id;
    segment_ids := array_append(segment_ids,new_segment_id);
  end loop;
  insert into public.meeting_watch_broadcasts(source_url,meeting_label,specialty,episode_index,episode_count,title,description,card_ids,status,starts_at,duration_seconds,source_hash,prepared_narrative,updated_at)
  values(payload->>'source_url',payload->>'meeting_label',nullif(payload->>'specialty',''),0,1,payload->>'title',payload->>'description',segment_ids,'planned',coalesce((payload->>'starts_at')::timestamptz,now()),(payload->>'duration_seconds')::integer,payload->>'source_hash',true,now()) returning * into created;
  return created;
end $$;
revoke all on function public.create_prepared_meeting_watch(jsonb) from public, anon, authenticated;
grant execute on function public.create_prepared_meeting_watch(jsonb) to service_role;
