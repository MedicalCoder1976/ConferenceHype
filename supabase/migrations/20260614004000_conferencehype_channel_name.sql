alter table public.stream_state
  alter column emergency_message
  set default 'ConferenceHype automation is paused while the operator desk reviews the queue.';

update public.stream_state
set emergency_message = replace(emergency_message, 'ASCO Hype', 'ConferenceHype'),
    updated_at = now()
where emergency_message like '%ASCO Hype%';

update public.sources
set enabled = false,
    updated_at = now()
where type = 'general_social'
  and (
    url like '%#ASCOHype%'
    or url like '%#AskASCOHype%'
    or url like '%@ASCOHypeAI%'
  );
