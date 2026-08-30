export const MEETING_WATCH_CLAUDE_OUTPUT_FORMAT = `{
  "schema_version": "conferencehype_meeting_watch_five_news_v1",
  "status": "ready",
  "meeting": {
    "name": "ESC Congress",
    "year": 2026,
    "dates": "August 28-31, 2026",
    "specialty": "Cardiology",
    "specialist_alert": "CARDIOLOGIST ALERT",
    "eye_catching_topic": "Five Hot Trials From Novartis, AstraZeneca and Other Leaders"
  },
  "news_items": [
    {
      "position": 1,
      "headline": "Complete, source-grounded news or abstract headline",
      "visible_text": "One concise on-screen sentence with the key result",
      "narration": "At least 55 words covering what happened, the study design or abstract context, key numbers, limitations, and why clinicians at this specialty meeting should pay attention. Attribute facts to the primary source. Do not give medical advice.",
      "primary_source_url": "https://official-primary-source.example/item-1",
      "source_label": "Official meeting abstract or company primary source",
      "abstract_number": "Abstract 1234",
      "study_name": "Exact study or trial name, or blank",
      "pharma_companies": ["Novartis"],
      "reported_numbers": ["Exact source-supported number"],
      "limitations": ["Source-supported limitation"]
    }
  ],
  "disclaimer": "One concise medical and educational disclaimer tailored to the meeting specialty.",
  "closing": "Briefly repeat the meeting name and dates, invite viewers to comment, subscribe, and suggest the next abstract or company update.",
  "quality_report": {
    "exactly_five_news_items": true,
    "five_distinct_primary_source_urls": true,
    "company_names_source_supported": true,
    "meeting_name_year_and_dates_repeated": true,
    "prohibited_phrases_absent": true
  }
}`;

export const MEETING_WATCH_CLAUDE_INSTRUCTIONS = `Return JSON only in the exact schema below. Create exactly five distinct, source-grounded news or abstract items from one named medical meeting. The caption must begin with the meeting name and year, followed by the specialty-specific alert. Use pharma company names when the relationship is explicit in an official abstract, trial registry, publication, or company primary source; never guess sponsorship or ownership. Give every item a distinct primary-source URL and at least 55 spoken words. Repeat the meeting name and full dates in the opening and closing. Do not use these phrases anywhere: Clinical Evidence Brief; New Evidence; The Story Behind the Result; Why This Result Matters.`;
