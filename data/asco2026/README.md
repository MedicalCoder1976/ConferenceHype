# ASCO 2026 Core Index

`core-index.json` is the low-cost backbone for ASCO Hype.

It is generated from:

- `C:\Users\lijos\OneDrive\Desktop\ASCO2026\ASCO_2026_Annual_Meeting_Sessions.xlsx`
- `C:\Users\lijos\Downloads\meeting_335_abstracts.csv`

The channel should not send either raw file to the LLM. The index stores compact, pre-cleaned session and abstract records. The briefing job selects only the relevant last-75-minute and next-60-minute window, then sends that small source pack to Grok.

Cost rule:

- Use the ASCO index for the recurring 3-minute schedule briefings.
- Use RSS, X, and media ingestion for the remaining programming.
- Use full abstracts only when needed for a human-selected deep dive.
- Treat abstracts as conference material and scheduled presentations, not verified medical guidance.
