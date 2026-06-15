delete from public.sources
where name ilike '%asco%'
   or url ilike '%asco%';

delete from public.medical_conferences
where name ilike '%american society of clinical oncology%'
   or acronym ilike 'asco';

delete from public.specialty_x_voices
where label ilike '%asco%'
   or handle ilike '%asco%'
   or note ilike '%asco%';

delete from public.segments
where title ilike '%asco%'
   or summary ilike '%asco%'
   or script ilike '%asco%'
   or title ilike '%ask-oh%'
   or summary ilike '%ask-oh%'
   or script ilike '%ask-oh%';

update public.stream_state
set current_segment_id = null,
    updated_at = now()
where current_segment_id is not null
  and not exists (
    select 1
    from public.segments
    where segments.id = stream_state.current_segment_id
  );
