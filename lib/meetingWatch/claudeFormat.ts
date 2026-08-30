export const MEETING_WATCH_CLAUDE_OUTPUT_FORMAT = `{
  "schema_version": "conferencehype_meeting_watch_story_v2",
  "status": "ready",
  "meeting": {
    "name": "ESC Congress",
    "year": 2026,
    "dates": "August 28-31, 2026",
    "specialty": "Cardiology",
    "specialist_alert": "CARDIOLOGIST ALERT",
    "eye_catching_topic": "Five Hot Trials From Novartis, AstraZeneca and Other Leaders"
  },
  "story": {
    "thesis": "One source-grounded sentence explaining the common clinical question or change connecting all five meeting updates.",
    "opening_hook": "A compelling 60-120 word continuation after the system-supplied meeting name, year, and dates. Create curiosity and preview the connected story without listing five unrelated headlines.",
    "closing_synthesis": "A 90-160 word ending that brings the five findings back to the thesis, distinguishes signals from practice-changing evidence, states the most important unanswered question, repeats the meeting name and full dates, and invites viewers to comment and subscribe."
  },
  "news_items": [
    {
      "position": 1,
      "headline": "Complete, source-grounded news or abstract headline",
      "visible_text": "One concise on-screen sentence with the key result",
      "bridge_from_previous": "Connect the opening thesis to item one; for later items, explain why this finding follows naturally from the previous one.",
      "narration": "A 90-180 word scene in the same continuous story. Cover what happened, study design or abstract context, exact key numbers, limitations, and clinical meaning. Attribute facts to the primary source, preserve uncertainty, and end with a thought that leads naturally into the next item. Do not restart the show, repeat the meeting introduction, say Number one through five, or give medical advice.",
      "primary_source_url": "https://official-primary-source.example/item-1",
      "source_label": "Official meeting abstract or company primary source",
      "abstract_number": "Abstract 1234",
      "study_name": "Exact study or trial name, or blank",
      "pharma_companies": ["Novartis"],
      "reported_numbers": ["Exact source-supported number"],
      "limitations": ["Source-supported limitation"]
    }
  ],
  "disclaimer": "A concise medical and educational disclaimer tailored to the meeting specialty and the specific subjects discussed. It belongs near the end and must not interrupt the opening story.",
  "quality_report": {
    "one_continuous_story": true,
    "exactly_five_news_items": true,
    "five_distinct_primary_source_urls": true,
    "narrative_bridges_present": true,
    "company_names_source_supported": true,
    "meeting_name_year_and_dates_repeated": true,
    "prohibited_phrases_absent": true
  }
}`;

export const MEETING_WATCH_CLAUDE_INSTRUCTIONS = `Return JSON only in the exact schema below. Write one continuous Meeting Watch story, not five disconnected evidence summaries. Model the pacing on a strong ConferenceHype story: begin with a curiosity-driven meeting hook, establish one clinical thesis, move through exactly five source-grounded meeting news items with explicit narrative bridges, then finish with a tailored disclaimer and a closing synthesis. The viewer should feel one argument developing from start to finish.

Keep the Meeting Watch identity: the YouTube caption begins with the meeting name and year followed by the specialty-specific alert; the opening and closing repeat the meeting name and full dates; and all five items must come from that meeting or its directly related abstracts. Each item needs a distinct primary-source URL and 90-180 spoken words. Include exact study names and numbers when supported. Use pharma company names only when an official abstract, trial registry, publication, or company primary source explicitly supports the relationship; never guess sponsorship or ownership.

Write conversational narration, not an abstract template. Do not say Number one, Number two, or reset the host between items. Do not repeat generic introductions, conclusions, or calls to action inside the five items. Do not use these phrases anywhere: Clinical Evidence Brief; New Evidence; The Story Behind the Result; Why This Result Matters. Do not provide medical advice.`;
