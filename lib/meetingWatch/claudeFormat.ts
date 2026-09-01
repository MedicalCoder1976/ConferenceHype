export const MEETING_WATCH_CLAUDE_OUTPUT_FORMAT = `{
  "schema_version": "conferencehype_meeting_watch_full_narrative_v3",
  "status": "ready",
  "meeting": {
    "name": "ERS Congress",
    "year": 2026,
    "dates": "September 5-9, 2026",
    "specialty": "Respiratory Medicine",
    "specialist_alert": "PULMONOLOGIST ALERT",
    "eye_catching_topic": "AstraZeneca, GSK and Boehringer Lead ERS Respiratory Updates"
  },
  "opening_hook": "Write the exact first 30-120 spoken words. Start with the meeting name and year, name two or more source-supported pharma companies, and preview the connected clinical subjects that follow. Be focused, conversational, and complete.",
  "abstracts": [
    {
      "position": 1,
      "headline": "Complete, source-grounded abstract headline",
      "visible_text": "One concise on-screen sentence with the key result",
      "narration": "Write the exact 30-65 spoken words for this abstract. Move naturally from the prior section, identify the study and population, state the most important source-supported number or result, preserve uncertainty, and end cleanly. Do not add a host label, section label, restart, or music cue.",
      "primary_source_url": "https://official-primary-source.example/abstract-1",
      "source_label": "Official meeting abstract or primary source",
      "abstract_number": "Abstract 1234",
      "study_name": "Exact study or trial name",
      "pharma_companies": ["AstraZeneca"],
      "reported_numbers": ["Exact source-supported number"],
      "limitations": ["Source-supported limitation"]
    }
  ],
  "disclaimer": "Write the exact concise educational disclaimer to narrate near the end.",
  "closing": "Write the exact final 20-50 spoken words. Synthesize what the abstracts collectively mean, repeat the meeting name and dates, state the key uncertainty, and invite viewers to comment and subscribe.",
  "quality_report": {
    "concise_hook": true,
    "five_to_ten_abstracts": true,
    "distinct_primary_source_urls": true,
    "company_names_source_supported": true,
    "complete_beginning_to_end_narration": true,
    "estimated_total_under_ten_minutes": true
  }
}`;

export const MEETING_WATCH_CLAUDE_INSTRUCTIONS = `Return JSON only in the exact schema below. This must be the complete, ready-to-narrate Meeting Watch script from the first spoken word through the final spoken word. ConferenceHype will not rewrite, summarize, join, or invent connective narration. It will narrate your text in order and insert 20 seconds of speech-free music between the hook, each abstract, and the closing.

The opening_hook must be a focused 30-120-word hook, not an exhaustive abstract-by-abstract summary. Begin with the meeting name and year. Name at least two pharma companies only when the supplied primary sources support those relationships. In clear, connected sentences, preview the diseases, mechanisms, or clinical questions covered next. It must sound natural when spoken and must not contain labels such as Hook, Introduction, Number one, or Abstract one.

Provide 5-10 source-grounded abstracts. Each narration must be 30-65 words and must be the exact spoken copy. Use a distinct primary-source URL for every abstract. Include exact study names and numbers only when supported. Move naturally from one abstract to the next without phrases that sound mechanically attached. Do not write host names, production directions, slide directions, music cues, markdown, or repeated show introductions.

The complete narration—including hook, every abstract, disclaimer, and closing—plus the required music must calculate to 10 minutes or less. Aim for 350-520 total spoken words; never exceed 600. Keep eye_catching_topic at 120 characters or fewer and make it a complete phrase. The application builds the final YouTube title at 150 characters or fewer.

Do not use these phrases anywhere: Clinical Evidence Brief; New Evidence; The Story Behind the Result; Why This Result Matters. Do not provide medical advice. Before returning JSON, read the hook, abstracts, disclaimer, and closing consecutively and repair any abrupt, duplicated, fragmented, or disconnected wording.`;
