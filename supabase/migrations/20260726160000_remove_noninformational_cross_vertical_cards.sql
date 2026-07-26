-- Remove pending placeholder/homepage cards that contain no article-level
-- information. This is deliberately limited to pending-review rows and does
-- not alter approved/rendered cards, station schedules, or broadcast state.
delete from public.segments
where status = 'pending_review'
  and (
    'weekly_source_context' = any(risk_flags)
    or id in (
      'e814468c-6c73-4677-8eaf-bcf9b182cc93', -- Healio homepage shell
      'aed8c9a6-9bfb-402d-9161-4b016481b895', -- Modern Healthcare homepage shell
      '74500f49-7a33-4df3-b960-c3abea53c5b6', -- Kidney Week homepage shell
      '6fcf79a6-6984-4fb9-8d6e-99e2c1041623', -- IDWeek homepage shell
      '4fbaa6f8-cd72-4864-968a-67a7a2cc9a0f', -- ACEP registration/program shell
      'cb57ca8c-c870-46a4-9e4a-b12fe71d5ce5'  -- ERS registration/program shell
    )
  );