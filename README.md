# ConferenceHype

ConferenceHype is a source-attributed medical-conference broadcast system. It
collects selected conference, journal, clinical-news, and social material,
builds an operator-controlled presentation, renders the program, publishes it
to YouTube, and exposes the same broadcast on `conferencehype.com`.

## Built with Codex and GPT-5.6

ConferenceHype was substantially extended during OpenAI Build Week 2026 with
Codex and GPT-5.6 acting as an engineering collaborator. Codex inspected the
existing application, traced failures across the codebase, GitHub Actions,
Supabase, Vercel, YouTube, Kokoro, and FFmpeg, implemented focused repairs,
added regression checks, and helped run shadow and production workflows.

The product and editorial decisions remained human-directed, including
PubMed-first sourcing, human approval before broadcast, low-cost operation,
complete-video delivery, and the rule that incomplete medical cards must
never air. Local installation and the judge testing path are documented under
**Verification** below.

## Production Flow

1. The operator selects conferences, journals, news sources, priorities,
   exclusions, custom coverage, and approved presentation slots.
2. Scheduled ingestion and generation create source-attributed review cards.
3. The operator edits, orders, approves, rejects, or atomically replaces cards.
4. In Daily coverage decisions, **Create one-hour batch cards** drafts and
   schedules cards into the presentation sequence for the selected hour only —
   it does **not** provision a broadcast. As soon as scheduling succeeds, the
   admin view jumps to **Presentation sequence** so the operator can see the
   approved scheduled cards immediately. This reuses unused weekly ready
   cards first, before generating anything new — reuse priority is: this
   week's real, source-backed cards first, then this week's "no new
   articles" announcement card, then any leftover card from a past week
   last (a stale past-week announcement must never outrank this week's real
   content just because it was created earlier).

   This endpoint is **not idempotent per hour**: calling it again for an hour
   that already has scheduled cards re-picks all 20 slots from scratch and
   will collide with what's already there (multiple cards landing on the same
   slot time). To move a batch to a different hour, first revert its existing
   segments back to `pending_review` (clear `approved_at`) before creating
   the new hour's batch — see `POST /api/admin/coverage-slots/create-broadcast`
   below for the matching slot-side cleanup.
5. Once the presentation sequence looks right, **Create broadcast**
   (`POST /api/admin/coverage-slots/create-broadcast`) provisions the approved
   `conference_coverage_slots` row for that hour. This is a deliberately
   separate, explicit step from card creation, so an operator can review the
   queued cards before committing to actually building and airing the hour.
6. The production cron (`.github/workflows/youtube-stream.yml`, every 15
   minutes, with a 30-minutes-back/90-minutes-forward lookback window)
   discovers any approved slot with `youtube_status: not_scheduled` and runs
   the full render/upload pipeline automatically — nothing further needs to
   be clicked. Alternatively, **Start selected hour** dispatches the same
   YouTube workflow immediately instead of waiting for the cron to discover
   it; the plan/preview buttons never start or confirm a broadcast on their
   own.
7. **Migrated 2026-07-16 from a live RTMP broadcast to render-then-upload;
   changed 2026-07-17 to publish immediately instead of a scheduled
   release.** There is no live broadcast object, no RTMP connection, and no
   "wait for the scheduled hour" step — `scripts/render-hour-broadcast.ts`
   renders the file, then uploads it directly to YouTube
   (`lib/youtube/uploadBroadcastVideo.ts`) with `privacyStatus: "public"`
   from the start. An earlier version of this migration uploaded as
   `private` with `publishAt` set to the slot's scheduled airtime, letting
   YouTube's own scheduler flip it public later — that added real
   complexity (a wall-clock "is this the currently airing one" derivation, a
   `stream_state` singleton picking the wrong queued video when multiple
   slots were queued ahead of their airtime, confirmed live 2026-07-17 with
   two journal slots queued in advance for the same night) for a benefit
   that didn't hold up in practice: render+upload already finishes close to
   the intended air time in the common cron-triggered case, so "public
   immediately" and "public at the scheduled time" rarely differed.
   Title/description/tags are resolved from the real, final rendered cards
   (via `buildBroadcastMetadata`) and set once, at upload time — there's no
   longer an earlier placeholder to correct afterward.
8. Supabase `stream_state` and the slot's row receive the resulting YouTube
   video ID/URL and `youtube_status: "queued"` once the upload succeeds —
   this is the terminal success status now (nothing writes `"live"` or
   `"completed"` to the database going forward).
9. The public site still derives whether a queued video should currently be
   featured as "live" or already "completed" from wall-clock time against
   the card schedule baked into the writeout at render time
   (`deriveDisplayYoutubeStatus` in `lib/data.ts`) — this now decides which
   already-public video to spotlight as current, not whether it's
   technically live, but the viewer-facing effect is the same: "Live now on
   YouTube" shows during the scheduled air window. Since `stream_state` is a
   singleton that only remembers whichever slot's status was written last,
   `getPublicBroadcastContext()` also checks both `conference_coverage_slots`
   and `journal_broadcast_slots` directly for a queued slot whose own window
   actually contains "now", and prefers that over the singleton pointer —
   otherwise a slot queued (and already public) well ahead of its scheduled
   window could get silently skipped once a *later*-queued slot overwrites
   `stream_state` first.
10. `scripts/verify-public-broadcast-alignment.ts` and
    `scripts/verify-youtube-delivery-loop.ts` confirm the rendered video, the
    uploaded YouTube video's status (including `privacyStatus: "public"`),
    Supabase's public stream state, and `conferencehype.com` all agree on the
    same video ID after upload.
11. Once the upload succeeds, every real (database-backed) segment used in
    that hour transitions `status: "approved"` -> `"rendered"`
    (`markSegmentsRenderedInDb`, called from `render-hour-broadcast.ts`
    right after a successful upload — deliberately *not* called if the
    upload fails, so a failed attempt's segments stay `"approved"` and are
    eligible for a retry instead of being silently consumed).
    `getNextBroadcastSegmentsFromDb` only ever selects `status = "approved"`,
    so this is what keeps an already-aired segment from being picked again
    for a future hour. **Because of this, the approved pool only shrinks as
    hours air — it does not refill itself.** Card creation/approval must
    keep pace with how much airs, or later hours will have thinner
    presentation sequences and less material available for bonus-card gap
    filling (see "Broadcast Presentation" below). Watch the approved-segment
    count if broadcasts feel sparse.

YouTube OAuth is required for delivery now — there is no RTMP-key fallback
(uploading a file has no raw-stream-key equivalent). "Continuous mode" (the
always-be-streaming fallback loop) was built entirely around the retired live
RTMP layer and is not currently functional under render-then-upload; treat the
"Allow continuous mode" admin toggle as dormant until that's redesigned or
removed.

GitHub `main` is the source of truth for final code. Any completed fix must be
committed and pushed to GitHub before it is treated as final, runnable, or ready
for production scheduling. Local-only workspace changes are not final code.

### Weekday journal station scheduling

The production weekday station releases exactly two new journal videos each
Monday through Friday, at 7:15 AM and 5:10 PM America/New_York. Each program
must contain at least 12 substantive, source-backed cards, and cards already
reserved earlier in the same week cannot be reused.

Journal selection remains quality-first. The scheduler tries the preferred
journal cadence and fallback list before other enabled journals. If those pools
cannot supply two complete, distinct programs, it may use an enabled journal
that was previously sidelined from the preferred cadence. Disabled journals
remain excluded. Publication freshness expands only as needed, in this order:
14, 21, 28, then 35 days. The 12-card floor is never lowered to fill a slot.

For the week of August 10, 2026, the station reserved 10 programs containing
120 unique cards with zero reuse. Friday, August 14 uses Advances in Radiation
Oncology at 7:15 AM and Annals of Surgery at 5:10 PM, with 12 cards in each
program. The fallback implementation was verified with `npm run typecheck`,
`npm run test:guards`, and `git diff --check`, and landed in commit `1d137bf`.

Every journal-video title begins with the journal name, followed by a specific
clinical topic and a readable specialty research hook. Viewer-facing metadata
must never use `Multiple Cancers`, and registry-only identifiers such as NCT,
ISRCTN, or ACTRN numbers are excluded from titles, descriptions, hashtags, and
tags. Descriptions begin with `<Specialty> Journal Club`, followed by explicit
`Journal:` and `Relevant specialties:` lines. Source-verified named studies may
appear in the description, but they do
not displace the journal from the title.

Every journal description also includes an `Audience:` line. It names the
specific specialists first—for example Gastroenterologists, Oncologists,
Hematologists, Cardiologists, or Psychiatrists—then adds the general discovery
terms `Physicians` and `Advanced Practice Providers (APPs)`. These audiences
also appear in YouTube tags, while titles remain focused on the journal and
clinical topic rather than being crowded with generic keywords. Audience
resolution uses both the journal's catalog specialty and the clinical topic:
for example, a JAMA lung-cancer broadcast targets both Internists and
Oncologists, and a Blood leukemia broadcast targets both Hematologists and
Oncologists.

## Public Site

- Status-aware YouTube player with direct YouTube, audio, and HLS fallbacks
- Live topic text only while the delivery state is actually `live`
- The public player, current topic, and visible rundown cards must always align.
  When a YouTube handoff has a saved `broadcast_writeouts` record, the public
  site uses that exact writeout as the source of truth for all visible cards.
  Do not show next approved/admin queue cards beside a different rendered video.
- The `ConferenceHype` first-viewport wordmark must never be hidden by,
  overlapped by, or visually crowded under the video/player box. Keep the
  homepage hero stacked until the text and player have enough horizontal room,
  and reserve a protected text column in two-column layouts.
- Broadcast audio reads only the material that is actually in the approved cards. Internal workflow procedure, source-checking instructions, missing-source explanations, and operator notes must never be narrated. If copy is not intended for the viewer-facing card, it is not broadcast material.
- Preparing, completed rehearsal, failed, and idle states without stale claims
- Current YouTube handoff read from Supabase on each request
- `#ConferenceHype` and `@conferencehype` audience routing
- Emergency override display
- Vercel Web Analytics and Speed Insights

The player prefers the Supabase video ID, then
`NEXT_PUBLIC_YOUTUBE_VIDEO_ID`, then the channel live page. The iframe is shown
only when `YOUTUBE_EMBED_ENABLED=true`.

The YouTube iframe identifies the site with:

- `origin=https://conferencehype.com`
- `widget_referrer=https://conferencehype.com`
- `referrerPolicy="strict-origin-when-cross-origin"`

These values prevent YouTube from treating the iframe as an unidentified
embedder.

## Broadcast Presentation

### Create a Story editorial rule

`Create a Story` broadcasts (`prepared_story`) must never show or narrate the
words "Physician Education." This rule applies to opening artwork, thumbnails,
all subsequent slides, transition panels, narration, and closing copy. Story
programs use ConferenceHype branding and the story-specific topic instead.

### Persistent evidence dashboard

Every newly rendered broadcast uses the shared evidence-dashboard slide
renderer. The center of the video must never be an empty color field:

- content cards show the source-verified title, Key Finding, Study Snapshot,
  Why It Matters, source attribution, and program progress;
- explicit Background, Methods, Results, and Discussion text is reused when
  present; otherwise the dashboard falls back to concise text already stored
  in the approved card and never invents missing study details;
- music cards show a branded Coming Next panel using the next approved card;
  its body text is always a like/subscribe + "suggest a journal in the
  comments" call to action (`lib/broadcast/evidenceDashboard.ts`), never
  inert filler like "A brief music transition..." — fixed 2026-07-30, that
  filler used to show on every transition slide except the final closing one;
- slide titles (including the Coming Next panel's next-title) must never be
  silently cut off. Two distinct bugs were fixed 2026-07-30 after a live
  broadcast showed a Coming Next slide reading just "End of" with nothing
  after it: (1) `stripSlideDescriptors()`'s "strip a leading label prefix"
  regexes (`TumorCrusher / Media Watch EMERALD-3 trial` -> `EMERALD-3 trial`)
  were unanchored, so they deleted the same phrase anywhere it appeared —
  the outro card titled "End of journal coverage" (`lib/rundown/slots.ts`)
  lost "journal coverage" to the "Journal Coverage" label pattern; fixed by
  anchoring every pattern to the start of the string (`^`), both in
  `evidenceDashboard.ts` and the identical `stripPreparedDescriptors()` in
  `lib/meetingWatch/preparedNarrative.ts`, which had the same unanchored bug
  applied to spoken narration text. (2) `wrap()`'s line-wrapping loop could
  drop the final overflow word with no ellipsis when it landed exactly on a
  line-count boundary, and `truncate()`'s ellipsis character was mojibake
  (`â€¦` instead of `…`) and could cut mid-word; rewritten so a truncated
  title always ends in a real `…`, cut at a word boundary when reasonably
  close to the limit.
- the persistent series header, footer, and narration-driven waveform remain
  overlays and do not alter card timing, narration, music placement, upload,
  scheduling, or activation;
- if structured sections are unavailable, a populated branded evidence-summary
  card is still rendered. A blank center screen is not an allowed fallback.

This contract is implemented once in `scripts/render-hour-broadcast.ts`, so it
applies to presentation, weekday station, single-journal, weekend roundup,
Meeting Watch/prepared narrative, and breaking-news broadcasts going forward.

- Created/ready cards are not automatically in the selected hour. A card only
  belongs to the broadcast presentation sequence after it is accepted and
  scheduled for that hour, dragged into a content slot, or used as a replacement.
  Admin card lists must show this distinction: ready cards are candidates, while
  scheduled slot cards are marked as approved in the presentation sequence.
- Daily card creation is selection-only. The admin selects the date and time,
  then checks the desired journals, meetings, abstracts, or media sources. No
  journal, meeting, RSS feed, or clinical-news source may be default selected.
  The batch algorithm must create cards only from those checked selections,
  using source IDs rather than loose title/source-name matching. Brand New Ready
  Cards remain candidates until the admin accepts, rejects, or replaces them
  into the presentation sequence.
- When a conference, meeting, journal RSS feed, clinical news source, or
  newspaper source is selected, both **Presentation sequence** and **Brand
  New Ready Cards** must show that selected source set only. Old ASCO cards,
  platform-smoke cards, and unrelated prior scheduled cards must stay hidden
  until the operator clears or changes the source selection.
- Daily guard verification must fail if an unselected journal/meeting/media
  item can generate a card or if a legacy untagged batch card can enter the
  presentation sequence.
- Viewer-facing transition cards are clean ConferenceHype cards. Internal
  labels such as "music card", "gap clip", or workflow instructions are not
  shown.
- Do not use internal generic source labels in prepared copy. Attribute the
  journal, meeting, media, or social source naturally instead.
- Cards placed into slots must visibly belong to one of six operator-facing
  types: Journal coverage, Abstracts, Conference Coverage, Media watch, Pharma
  watch, or Diagnostic Company watch.
- If any card contains missing-intake failure language instead of source detail,
  replace the entire card with the stored music transition. Do not voice or
  display that card as content. If a social-voices card or any other card is
  empty, play only music for that slot.
- Journal-review cards begin their substantive content with: "From the
  [Month] edition of [Journal Name]". They should condense the abstract,
  methods, results, and discussion into broadcast language rather than merely
  reading the article headline.
- Article, abstract, journal, and clinical-news cards must be PubMed-first when
  a PubMed record can be found. Use the complete PubMed abstract to write
  specific Background, Methods, Results, and Discussion content. Do not build
  article cards from RSS issue metadata alone.
- PubMed title matching must be exact (after stripping the RSS feed's leading
  category tag, e.g. `[Articles]`, `[Review]`, `[Comment]`). Never accept a
  "best guess"/top-relevance result as a fallback when no exact title match is
  found — that has previously misattributed an unrelated article's abstract to
  the wrong journal. No match means no PubMed enrichment for that item, not a
  guess. NCBI E-utils calls must stay throttled to roughly 3 requests/second
  with a retry on `429`; a rate-limited response is not the same as "no record
  found" and must not be treated as one.
- When a journal's own RSS feed fails entirely (e.g. a publisher 403ing
  GitHub Actions' IP range — confirmed for several Wiley and AHA journals),
  `runIngestionJob` in `lib/jobs/ingest.ts` falls back to a direct NCBI
  `[Journal]` field search (`fetchPubMedArticlesForJournal` in
  `lib/sources/pubmed.ts`) for that journal's last ~90 days, only for
  sources matched by exact catalog journal id (never a name/URL heuristic).
  This is a different mechanism from the title-matching rule above — it is
  not a "best guess," it is a genuine search scoped to that specific
  journal's own indexed output. A journal whose RSS succeeded but returned
  nothing new this week gets the same PubMed `[Journal]` search too, always
  *before* the X topic-search fallback — PubMed is the higher-priority, more
  authoritative source for journal content and must be exhausted before
  falling back to a generic social search. This rule applies to every card
  generation path, not just the Sunday sweep: the shared
  `pubMedRescueJournalItems()` in `lib/weeklySourceCardGeneration.ts` is
  called by both `scripts/generate-weekly-source-cards.ts` and the
  on-demand "generate more cards" admin action
  (`app/api/admin/source-cards/regenerate/route.ts`), so the two entry
  points can't drift apart on this again.
- The NCBI throttle (`ncbiFetch` in `lib/sources/pubmed.ts`) must genuinely
  serialize calls, not just gate on a shared last-call timestamp. A
  timestamp-check-then-set is not atomic across concurrent async calls —
  every caller that starts before the first one finishes reads the same
  stale timestamp and computes the same wait, so they still fire in a burst.
  `POST /api/admin/intake-cards/hour` enriches every matched item via
  `Promise.all`, so this isn't a theoretical race: confirmed empirically on
  2026-07-04 that a batch of 30 items enriched 16/30 successfully one at a
  time but 0/30 through `Promise.all`, because the burst got rate-limited by
  NCBI and returned the exact "422: No selected items could be turned into
  PubMed-backed journal cards" admin error. Fixed by chaining every call
  through a single queue promise so concurrent callers genuinely wait their
  turn. If this error recurs, suspect the throttle regressing back to a
  timestamp-only check before suspecting a real lack of PubMed coverage.
- For abstract and journal cards backed by a structured clinical-trial
  abstract (one that actually contains a Methods- or Results-style section),
  the voiced narration itself must explicitly say Background, Methods,
  Results, and Discussion. Voice framing and word trimming must not remove
  any of the four section labels — but preserving the labels must never mean
  compacting the actual content down to a token summary. The full narrative
  is read as-is whenever it already fits the segment's word budget (the
  normal case); the four-section split only kicks in, with each section
  getting a fair share of the real budget, when the narrative genuinely
  exceeds it. An earlier version of this logic compacted every structured
  card to a fixed ~13 words per section regardless of budget, which is what
  "just intros of the voices and generic music" on the public site turned
  out to mean — nearly every real journal card was being read as a ~50-word
  summary instead of its actual content.
- Two compounding bugs, both fixed 2026-07-06, previously caused structured
  cards to end mid-sentence or duplicate an earlier section's text:
  `buildBatchSegment` (`lib/intakeCards.ts`) hard-truncated the whole
  Background/Methods/Results/Discussion narrative at a blind 82-word cutoff
  for any source `isJournalItem()` didn't recognize by name (e.g. "JCO
  Precision Oncology"); and `matchSection`'s regex
  (`lib/segments/sectionSummary.ts`) capped its capture at 700 characters,
  which didn't just truncate an overlong section but made the match fail
  outright whenever a real Results/Discussion section ran longer than that,
  silently falling back to a position-based sentence pick from the whole
  abstract. Fixed by letting `sectionSummary` through in full (it already
  keeps each section to one sentence via `firstSentence()`, so it doesn't
  need a second, cruder cap) and removing the regex's upper bound (only a
  floor is needed). Cards generated before this fix keep their original
  truncated/garbled text — nothing retroactively repairs already-created
  segments (see `scripts/regenerate-structured-article-cards.ts` if that's
  ever wanted, but it also rejects any segment it can't re-verify against a
  live PubMed abstract, so treat it as a deliberate, reviewed action, not a
  quick fix).
- `matchSection`/`sectionValue` (`lib/segments/sectionSummary.ts`) and
  `sectionText` (`lib/broadcast/voiceSegment.ts`) must require a colon after
  a section label (`Background:`, `Methods:`, `Results:`, `Discussion:`) —
  never treat a bare occurrence of one of those words *inside* a sentence as
  a section boundary. Confirmed live 2026-07-18 on a real card (PMID
  40729623): the Results text naturally read "...with notable increase for
  prognostic **discussion** tools (P < .05)" — that stray word was
  misread as a real "Discussion:" header, truncating Results to its first
  sentence and fabricating a garbled fake Discussion ("Discussion: tools (P
  <.05).") from whatever text followed it, instead of the article's real
  Conclusion. This produced 44 duplicate segment rows for the one article
  across past runs, all carrying the identical garbled fragment. Fixed by
  making the colon mandatory in both the label match and the lookahead
  terminator in both functions — every string either function receives is
  already normalized to `"Label: text"` before it arrives, so a genuine
  section header is always colon-terminated and this only removes false
  positives. Deliberately left `extractSection` in `lib/sources/rss.ts`
  unchanged — it parses raw scraped journal-webpage HTML where real
  headings often carry no colon at all, a different risk profile.
- Narrative reviews, editorials, and commentaries have no real Methods or
  Results to extract. Do not force the four-section template onto these —
  that fabricates a "Results"/"Discussion" label over an arbitrary sentence
  split. It is fine to simply say this is a good review on the topic and
  point listeners to read it in that issue of the source journal.
- Conference and meeting cards must not read URLs or page code. If an official
  meeting page exposes script text instead of readable content, discard the
  code-like text and fall back to the official page title/description or a
  neutral official-schedule summary.
- Hourly rising social voice cards must contain actual monitored voices,
  leaderboard entries, or operator-curated watchlist voices. Do not ship a
  placeholder that says there is no content.
- The full disclaimer is placed on a dedicated notice approximately every
  15 minutes instead of being repeated in every segment.
- Every narrated card is followed by an automatic music transition. The next
  card may only begin once that music transition point is reached; narration must
  never skip the transition or overlap another spoken card.
- The rendered broadcast is a hard 60-minute frame. If prepared cards exceed
  60 minutes, remove trailing card material as whole cards from the end until
  the program fits. If the remaining content is shorter than 60 minutes, fill
  the gap with music so the final render stays within the hour.
- The hour's 20 official slots are a fixed presentation-sequence structure
  (`CONTENT_CARDS_PER_HOUR` in `lib/broadcast/hourSchedule.ts` — 4 personas x
  5 cards each, exactly what the admin schedules and what
  `scripts/verify-broadcast-guards.ts` checks), but the *rendered* hour can
  contain more cards than that. Real spoken length routinely undershoots the
  135s nominal slot (often 45-90s), and rather than dump 100% of that
  leftover into a single stretched music transition,
  `fillLeftoverGapsWithBonusCards` (`scripts/render-hour-broadcast.ts`) caps
  each gap at `MUSIC_SECONDS + 30s` and spends the reclaimed time on extra,
  already-approved real content instead, drawn from the same pool
  `buildBroadcastSlots`' own round-robin fallback already uses (segments
  approved but not pinned to this specific hour) — falling back to a longer
  music stretch only once that pool is exhausted. Added 2026-07-08; verified
  on real data this took a broadcast hour from 20 to 36 content cards with
  music gaps averaging ~47s instead of ~120s. This only touches the render
  step, never the admin-facing 20-slot schedule, scheduling API routes, or
  `scheduledContentAt`.
- Bonus-card and round-robin-fallback candidates must be deduplicated by
  *content*, not just database row id (`contentSignature` in
  `scripts/render-hour-broadcast.ts`, preferring the first citation URL, then
  normalized script text). Found 2026-07-08: an old ingestion run left 5
  separate approved rows citing 2 distinct tweets (3 rows for one, 2 for the
  other) with byte-identical script text each — nothing before this dedup
  caught that these were the same underlying source item under different
  ids, so the same card could be (and was) selected 2-3 times into one hour.
  If a "the same card played twice" report recurs, check for duplicate rows
  sharing a citation URL or script text first, before assuming a scheduling
  bug.
- Narration style: pronounce `ASCO` as `ASKho`/`Ask-ho`, never as the individual letters A-S-C-O. Pronounce `cholangiocarcinoma` as `COLANGIOCARCINOMA` ("colangio-carcinoma"); the `ch` is a hard `k` sound and must not be read as "cho". Pronounce `Ib` and `1b` as `one B`. Pronounce `ECOG` as a word (`EE-kog`), not individual letters. Expand `PR` to "partial response", `CR` to "complete response", `pCR` to "pathologic complete response", and `WHO` to "World Health Organization" when spoken. Spell `NCI` out as individual letters ("N-C-I"). Cancer-staging notation (Roman numeral immediately followed by a letter, e.g. `IA`, `IIA`, `IIIB`, `IVA`) is read as the cardinal number plus the letter — `IA` as "one A", `IIA` as "two A", and so on. All 12 three/four-letter month abbreviations (`Jan`, `Feb`, `Mar`, `Apr`, `Jun`, `Jul`, `Aug`, `Sep`/`Sept`, `Oct`, `Nov`, `Dec` — PubMed citation dates commonly use these) expand to the full month name when spoken; `May` needs no rule since the short and long forms are identical. Fixed 2026-07-30: only `Jul`/`Aug` had a rule, so `Jun` (and every other month) was mis-read on air. Any abbreviation the source abstract defines in parentheses (e.g. "progression-free survival (PFS)") is expanded to its full form everywhere it's spoken, even if the generated script itself never restates the definition — `applySpokenPronunciations` is given the source excerpt as context at generation time (`lib/generation/llm.ts`), not just the script text, and is re-applied with the full card context again at render time as a second safety net.
- Structured-abstract narration must never repeat section cues. Treat PubMed labels such as `BACKGROUND AND AIMS:` as one Background section, never voice `Background: Background and aims:`, and pronounce uppercase `AIMS` as the ordinary word "aims," not as separate letters. This cleanup runs during card construction and again immediately before TTS so older approved cards receive the same protection.
- Topic handoffs must remain audibly filled and concise. Journal, weekend-roundup, regional-journal, and Meeting Watch transitions use 20-second speech-free music gaps. The shared renderer loops and trims the approved gap clip to the exact scheduled transition window so a longer slot cannot end with dead silence after the clip fades.
- Broadcast closing: never narrate "That is it for this segment." A single-journal program must say "That's it for now" and "If anything was missed" exactly once, in the dedicated final outro at the true end of the journal broadcast; content-card group boundaries must never repeat either phrase. The close identifies the journal and issue month/year and uses the complete X call to action: "Tag us on X @conferencehype."
- Operator music cards are allow-listed original three-minute instrumentals in
  `public/music/fast-jazz-blocks`. The Admin Music cards panel may replace one
  presentation card with a selected Funk or Latin track. One music card occupies
  exactly one existing 135-second content + 45-second transition pair, so the
  hour remains exactly 60 minutes and later slot timestamps do not move. The
  replaced good editorial card returns to pending review, and the DB-backed
  music card is marked rendered only after successful delivery. Music cards are
  never sent to TTS.
- Transition audio rotates through six 20-second tracks:
  four licensed voiced stingers in `public/music/gap-clips` and two generated
  preview tracks in `public/music`.
- Gap-clip stinger intros must never name a specific upcoming speaker,
  persona, or content type (e.g. "Up next, Adam on the snarky social feed").
  These 20-second clips rotate on their own index
  (`scripts/render-hour-broadcast.ts`'s `GAP_CLIP_PATHS`/`gapClipPaths`
  rotation), completely independent of which persona the card scheduler
  (`lib/rundown/slots.ts`) actually picks next — nothing ties a clip's
  position to a real card. The four licensed stingers previously promised
  named "up next" speakers ("Fenrir", "Rebecca", "Adam", "AussieOnc") left
  over from an earlier DJ-persona concept (`scripts/generate-kokoro-dj-voice.py`)
  that was never wired into the actual broadcast; none of those names exist
  in the current 17-persona roster (`lib/generation/personas.ts`), so the
  promised segment never followed. Keep stinger intro text generic (matching
  `formatTransitionCard()`'s copy) instead. This is a separate failure mode
  from the "replace empty content cards with music" rule two bullets below —
  that rule covers real dynamic cards with no script; this one covers a
  static licensed audio asset whose baked-in spoken intro makes a promise the
  scheduler can't keep. Fixed 2026-07-04; see `scripts/generate-licensed-gap-clips.ps1`.
- Active scripts and data use general ConferenceHype branding. Retired
  conference-specific branding was removed from current content.
- When a rendered MP4 is streamed, FFmpeg maps the MP4's own video and audio.
  It does not layer separate voice or music inputs over the finished program.
- The synthetic gap-music bed (`scripts/generate-gap-music.ps1`, current
  output `public/music/conferencehype-gap-music-6min-v6.mp3` +
  `conferencehype-gap-music-20sec-preview-v4.mp3`) must never contain a layer
  gated to fire on a sub-6-second periodic cycle (e.g. an ffmpeg `mod(t\,1)`
  or `mod(t\,2)` volume/noise gate). A `[clap]` layer that gated a bandpassed
  noise burst once every `mod(t\,1)` second was previously baked into every
  version through v4 — because the bed loops continuously under the entire
  hour (mixed in at all times, not just during gap-clip transitions), that
  read on the live broadcast as a constant background buzz for the full hour,
  not an occasional percussion hit. Removed entirely in v5/v3 (2026-07-04).
- The hour's final audio mix (`scripts/render-hour-broadcast.ts`, the
  `amix` filter combining the music bed, every voice clip, and every gap
  stinger) must use `duration=longest`, never `duration=first` or
  `duration=shortest`. `amix`'s `duration=` setting picks output length
  from whichever stream is in that position, not from the overall content —
  when the bed became one short, finite clip per music slot (still first in
  the input list) instead of one continuous hour-long loop, `duration=first`
  made the *entire* mixed output end the instant that first, early, short
  bed clip finished, silencing almost the whole hour even though the video
  kept rendering and ffmpeg reported success. Confirmed on a real broadcast:
  only the opening few minutes were audible. Fixed 2026-07-12 by switching
  to `duration=longest` (runs until the latest-ending scheduled stream,
  always near the end of the hour); reconfirmed clean on the next real
  broadcast — ffmpeg's own progress log reached `time=00:59:59.99` of the
  60:00 target with zero dropped frames, versus the broken run's audio
  stalling at `time=00:57:39.90` for over 2 minutes before erroring.
  Kick/sub/bassline layers gated at `mod(t\,0.5)`/`mod(t\,2)` are fine — they
  sit under 250 Hz and read as bass pulse, not buzz — but do not add a new
  gated layer in the 900 Hz+ range without listening to a full-hour render
  first.
- This bed must also stay purely instrumental. v1 through v5 baked in a
  spoken "ConferenceHype!" Kokoro stinger (`am_adam`) every 90 seconds —
  because the bed loops continuously under the entire hour, that surfaced on
  the live broadcast as an unpredictable "ConferenceHype" voice bleeding
  through under the narrator's own narration, not an occasional transition
  moment. Removed entirely in v6/v4 (2026-07-06). The gap-clip stingers in
  `public/music/gap-clips/*.mp3` already cover the spoken "up next" moment
  and only mix in during actual music-transition slots — do not reintroduce
  spoken word into this continuous bed.

Keep purchase and license evidence for third-party tracks outside the
repository. See `public/music/README.md`.

## Admin

### Broadcast

- Configure daily sources, priorities, exclusions, and breaking-news behavior.
- Edit and order the one-hour presentation sequence.
- Drag review cards into exact content slots.
- Preview and place any of the 20 three-minute Funk/Latin music cards into a selected presentation slot.
- Approve, reject, discard, or atomically replace cards.
- The top navigation includes a dedicated **Pending Review** tab showing the
  complete quality-passing journal-card queue. Operators can review or edit
  individual cards, approve or reject them one at a time, or use the confirmed
  **Approve all** action. Large queues are submitted sequentially in 1,000-card
  request batches, below the API's 2,000-ID safety limit, and the UI aggregates
  the results. Every batch still runs server-side deduplication and the normal
  quality validator; duplicates and cards that fail source or structure checks
  are skipped rather than force-approved.
- Manage source URLs, X follows, social items, and emergency overrides.
- Approve conference coverage by slot, day, or week.
- Two explicit, always-visible buttons control continuous YouTube delivery
  (`components/StartStreamButton.tsx`, redesigned 2026-07-08 from a single
  state-toggling button): "Stop continuous / scheduled only" and "Allow
  continuous mode." Scheduled-only (continuous off) is the default/expected
  mode; continuous is a deliberate opt-in an operator chooses, not something
  a single ambiguous toggle should make easy to leave on by accident.
  Whichever action matches the current state is disabled so it can't be
  clicked redundantly. Both call the same `/api/admin/start-stream` route
  with `action: "start"` or `"stop"` — no backend change, just two explicit
  entry points instead of one.
- Inspect YouTube status, video links, workflow links, and delivery errors.
- The "Weekly ready-card pool" panel (`components/DailyCoveragePlanner.tsx`)
  is deduplicated by content signature and sorted/grouped alphabetically by
  journal name, with a visible journal-name badge per card. Fixed
  2026-07-18: the weekly batch and the one-hour batch can each independently
  generate their own segment row for the same underlying article (same
  citation url, different ids) — one real article had 44 duplicate rows,
  which rendered as repeated identical tiles before this fix. The
  per-journal/conference deck view (`lib/cardDeck.ts`'s `buildDeck`) gets
  the same content-signature dedup.
- **Release all ready cards** sends the visible segment IDs as a JSON request
  and handles an empty HTTP response with an operator-readable error. This
  prevents the former `Unexpected end of JSON input` failure while retaining
  the server-side approval quality gates.
- `getAdminSnapshot` (`lib/data.ts`) runs its ~20 independent Supabase calls
  via `Promise.all` instead of one after another, and the "one-hour planning
  slots" picker only spans 24h back through 48h forward (not a full week) —
  fixed 2026-07-18 after `/admin` navigation (which is `force-dynamic` and
  reruns this on every request) was reported very slow.

### Journal Watch

- Manage official RSS or Atom feeds.
- Develop the latest issue into an editorial package.
- Generate at most one unseen issue package per run to control LLM cost.

Current seeded feeds:

- The Lancet Oncology
- The Lancet Haematology
- The New England Journal of Medicine
- JAMA
- Nature Medicine
- Nature Cancer
- British Journal of Cancer
- Leukemia
- Blood Cancer Journal
- Annals of Oncology
- The Lancet

Run `npm run test:rss` to make a live request to every seeded feed.
Psychiatry coverage includes JAMA Psychiatry, American Journal of Psychiatry,
The British Journal of Psychiatry, Molecular Psychiatry, World Psychiatry,
Psychiatric Services, and Journal of Child Psychology and Psychiatry. Publisher
feeds are used when they are dependable; American Journal of Psychiatry, The
British Journal of Psychiatry, and Psychiatric Services use exact PubMed
`[Journal]` queries because their publisher feed endpoints reject automated
requests. JAMA Psychiatry must remain labeled `Psychiatry`, while Journal of
Neurology, Neurosurgery & Psychiatry must remain labeled `Neurology`.

Psychiatry cards follow the same source and approval rules as every journal:
start at PubMed, require substantive abstract-grounded Background, Methods,
Results, and Discussion coverage, keep generated cards in pending review, and
never auto-approve a title-only, missing-abstract, or otherwise source-limited
card. Weekly availability is not proof of complete intake; feed-level sync,
article, reconciliation, and card-state counts must be audited before claiming
that no psychiatry journals or articles were missed.

### Meeting Watch

- Manage the medical-conference catalog.
- Add exact dates only from official conference sources.
- Choose one-hour coverage slots.
- Approve an individual slot, a day, or the next seven days.
- Develop source-verified meeting packages.
- Prepared-broadcast/Meeting Watch packages use only facts stated in the supplied source. One narrow exception: a drug's originating or marketing pharma company may be named even when the source itself doesn't name it, but only when that attribution is certain beyond doubt (e.g. the company's own press release). Otherwise the company slot is omitted rather than guessed.
- ASH-style and other Meeting Watch reviews are trial-atomic: every host turn and card for one trial stays consecutive, and no music transition or disclaimer is inserted inside that trial. If a pasted prepared package leaves and later returns to a trial, preview automatically groups that trial together, renumbers its cards, and moves its transition/disclaimer to the completed trial boundary; the preview explicitly reports the correction for operator review. If the remaining frame cannot fit the entire next trial conversation, none of that trial is admitted.
- Every newly rendered program reserves two seconds before its first narration. The renderer preserves the fixed program length by borrowing those two seconds from a later music block, never from speech, and fails closed if that is impossible. Measured voice clips are checked for timeline overlap before FFmpeg runs.
- TTS reads `Jul` as `July` and `Aug` as `August`. Other abbreviations are expanded only when their full form is explicitly present in the reviewed source context; unknown abbreviations are not guessed. Definition extraction is bounded and performed once per trial/source, then reused by every turn; the 75-turn performance guard must remain under one second.
- Meeting Watch render jobs have a 90-minute safety budget, cache Kokoro/Hugging Face/voice artifacts, and emit database-backed heartbeats at pronunciation, voice synthesis, encoding, and upload boundaries. A separate cleanup job marks cancelled or timed-out renders failed, and the scheduled poll expires any two-hour stale rendering lease before selecting new work.

### Weekly Source Cards

- At the start of each week, `weekly-source-cards.yml` pre-generates
  template-based ready cards (no LLM cost) for every enabled conference,
  journal, and clinical news/newspaper source. These appear under that
  entity's checkbox in Broadcast, Journal Watch, and Meeting Watch, with the
  full spoken script — not just a title — visible in the card deck so the
  operator can review the actual material before it ever airs.
- The admin page's "Run weekly batch now (free)" button runs all three
  entity types together, matching the scheduled cron. Three additional
  buttons — "Run journals batch now", "Run conferences batch now", "Run
  newspapers batch now" — trigger only one entity type via the workflow's
  `scope` input (`all` / `journals` / `conferences` / `newspapers`), so a
  much smaller journals-only run (or any single type) doesn't also
  regenerate cards for the other two. `WEEKLY_SOURCE_SCOPE` is read by both
  `scripts/generate-weekly-source-cards.ts` and
  `scripts/verify-weekly-source-cards.ts`, so a scoped run's own
  verify/repair steps don't fail on entity types it deliberately skipped.
- Click "View deck" under any conference, journal, or source to expand its
  card list and read each card's entire broadcast script, every time. There
  is no summary shown here and no truncation — the card list scrolls, not the
  individual card, so a full ~6-minute script always renders in totality.
- If the operator does not like what is there, click
  **"Don't like these? Generate more cards"** under that same entity. This
  calls `POST /api/admin/source-cards/regenerate` (entityType +
  entityId), which re-checks that one entity's official sources/abstracts/RSS
  for anything not already covered, falls back to an X post search (own
  account, or whoever is discussing it) if nothing new is found there, and
  appends any new cards to that entity's deck. It is purely additive — it
  never deletes or replaces existing ready cards, so re-clicking it is always
  safe.
- This is scoped to a single entity per click, not a full catalog re-sweep,
  so it is cheap enough to use repeatedly while reviewing.

### Records

- **Writeouts:** ordered spoken cards, sources, YouTube and workflow links,
  delivery state, and errors for each render.
- **Memory:** developed packages waiting for an operator-assigned start time.
- **Specialty X Voices:** curated and operator-added voices, blacklist
  controls, and a real-ingestion leaderboard with no fabricated rankings.
- **Talked About:** every card that has actually aired (`status: "rendered"`),
  newest first, with its source attribution and a "Send back for
  re-presentation" button. Updated 2026-07-09: aired cards used to stay
  mixed into their journal/conference/source's regular deck (just tagged
  "Presented") — they're now excluded from that deck entirely
  (`lib/cardDeck.ts`'s `buildDeck`) and only live here. "Send back" reuses
  the existing `/api/admin/approve` endpoint (`action: "approve"`, no new
  backend logic) to move a card from `rendered` back to `approved`, making
  it schedulable again. Confirmed `buildDeck()` is display-only — this
  doesn't touch card creation, selection, or the render/broadcast pipeline.

## Required Services

- Vercel: Next.js site, admin API, analytics, and performance monitoring
- Supabase: editorial data, schedules, writeouts, and delivery state
- GitHub Actions: generation, rendering, embed checks, and publishing
- YouTube Data API OAuth: fresh broadcast creation and embed management
- LLM provider: script generation
- Kokoro: render-time speech
- X API: optional social monitoring

## Configuration

Use `.env.example` as the local template. Never commit secret values.

### Vercel Production

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SHARED_SECRET
GITHUB_DISPATCH_TOKEN
GITHUB_DISPATCH_REPO
YOUTUBE_EMBED_ENABLED=true
```

Optional public fallbacks:

```text
NEXT_PUBLIC_YOUTUBE_VIDEO_ID
NEXT_PUBLIC_YOUTUBE_CHANNEL_ID
NEXT_PUBLIC_AUDIO_STREAM_URL
NEXT_PUBLIC_HLS_URL
```

### GitHub Actions Secrets

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LLM_API_KEY
LLM_BASE_URL
LLM_MODEL
YOUTUBE_OAUTH_CLIENT_ID
YOUTUBE_OAUTH_CLIENT_SECRET
YOUTUBE_OAUTH_REFRESH_TOKEN
```

Optional services and legacy fallback:

```text
X_BEARER_TOKEN
YOUTUBE_RTMP_URL
YOUTUBE_STREAM_KEY
NEXT_PUBLIC_YOUTUBE_VIDEO_ID
```

Set the GitHub Actions variable `YOUTUBE_PRIVACY_STATUS` to `public` for
production scheduled broadcasts so saved streams appear on the ConferenceHype
YouTube channel. Use `unlisted` only for rehearsals or private tests.

The ConferenceHype Google OAuth app is published **In production**. Refresh
tokens issued after production authorization are no longer subject to Google's
seven-day Testing-mode expiration rule, although they can still be revoked by
the account owner or Google security controls. The OAuth client must include
`https://developers.google.com/oauthplayground` as an authorized redirect URI
when OAuth Playground is used to obtain that token.

Rotate the OAuth client secret and refresh token immediately if either is
exposed in chat, logs, screenshots, or source control.

### Renewing the YouTube refresh token
## Continuous journal station and manual break-ins

The station planner in the admin Broadcast tab creates a daily three-hour wheel
of six 30-minute specialty/journal programs. The wheel repeats across the day.
For a journal with new ready cards, the operator renders a new program. If the
card count is zero, the planner reuses the latest verified program for that
journal (or, secondarily, that specialty). Music already fills unused time
inside every 30-minute render.
Each new program reserves at most twelve quality-passed cards. This bounds the
approval transaction and render input while leaving excess cards in their
journal deck for a later program.

The regular Monday-Friday journal wheel releases exactly two distinct new
journal videos per day at **7:15 AM and 5:10 PM America/New_York**. The
`weekday-station-wheel.yml` prepares both programs in advance, uploads them
privately, and asks YouTube to publish each at its assigned time. Each YouTube
title includes the journal title. Assigned articles must predate the broadcast
date and normally be no more than fourteen days old; a bounded twenty-one-day
fallback is allowed only when two complete twelve-card decks cannot be assembled
from the fourteen-day window. Selection stays within the approved flagship list
and never lowers the twelve substantive, source-backed card floor. Activation
fails closed until two distinct verified YouTube IDs exist. Unused cards remain
available, and the separate weekend roundup is unchanged.

Morning-journal recovery is deliberately fail-closed. GitHub Actions runner
delays must not silently turn a scheduled run into a successful no-op:
`weekday-station-wheel.yml` retains the intended UTC release date, and
`weekday-station-activate.yml` proceeds whenever the delayed run starts at or
after its minimum activation hour. Publication dates from PubMed/RSS are
normalized to ISO before freshness comparisons, including values such as
`2026 Jul 31`. The planner skips an assigned flagship journal when fewer than
the renderer's twelve substantive source-backed cards are eligible and tries
only the approved flagship fallback list; it never lowers the render quality
gate. After activation, `refresh-station-video-metadata.yml` can safely refresh
the canonical video's title and high-contrast thumbnail in place, with exact
operator overrides, without uploading a duplicate. This recovery policy was
verified end to end on 2026-08-05 with one public 14:52 Blood broadcast reused
across all six station positions.


This feature is additive and fail-closed:

- The station tables are private service-role tables created by migration
  20260722170000_station_schedule_and_breakins.sql.
- A weekday schedule cannot become active until both new uploads verify as two
  distinct YouTube IDs; otherwise the existing public player remains unchanged.
- The public page selects only an active schedule and a verified current
  program. If either is absent, it retains the existing working YouTube
  broadcast without changing stream_state.
- station-program.yml and station-breakin.yml are isolated manual workflows;
  they do not alter the proven scheduled youtube-stream.yml path.
- A manual breaking-news card is source-labelled, approval-validated, and
  rendered as a 15-minute program for either the next :00 (top) or next :30
  (bottom) boundary. It temporarily takes public-player precedence only during
  its verified 15-minute window. A failed render leaves the current player
  untouched.

### Twitter / X Stream tab

The admin top navigation includes a dedicated **Twitter Stream** tab. It builds
a zero-cost replay plan from prior station programs that already have verified
YouTube video IDs. The operator selects one specialty, a start time, and a
one-to-six-hour duration. The planner schedules two journal broadcasts per
hour—one at `:00` and one at `:30`—and cycles only through previous broadcasts
from that same specialty. It does not render new media or call an AI service.

The tab copies an operator-readable run plan with the journal, title, and replay
URL for every half-hour boundary. Actual X delivery remains fail-closed: do not
label the stream live until X Media Studio Producer ingest access and a
persistent local encoder have passed a private test. An app-only bearer token
is not sufficient for posting or creating a live broadcast, and a Vercel
request or temporary GitHub runner must not be treated as the persistent
encoder.

If the OAuth consent screen is returned to Testing status, Google can expire a
YouTube-scope refresh token after seven days. Keep the app In production.
The following tools provide renewal detection and recovery without exposing
token values:

1. **`npm run youtube:refresh-token`** opens your browser for one sign-in/
   approval click, exchanges the code for a new refresh token, and pushes it
   straight to the `YOUTUBE_OAUTH_REFRESH_TOKEN` GitHub secret via `gh secret
   set` — the token value never touches the terminal output or any log.
   Requires `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET` in
   `.env.local` (see `.env.example`) and a one-time addition of
   `http://localhost:53682/oauth/callback` to the OAuth client's authorized
   redirect URIs in Google Cloud Console.
2. **`.github/workflows/youtube-oauth-health-check.yml`** runs daily and
   tries a real refresh-token grant against Google. If it fails, it opens (or
   keeps open) a single "YouTube OAuth token needs renewal" issue instead of
   waiting for a scheduled broadcast to silently fail; it auto-closes that
   issue once a check passes again.

## Database Migrations

Apply every file in `supabase/migrations` in filename order. Important current
migrations include:

- `20260614005000_public_youtube_delivery.sql`: public YouTube handoff and
  persistent continuous-feed state
- `20260615173849_remove_legacy_conference_content.sql`: removes retired
  conference-specific content from active data
- `20260709120000_journal_specialty.sql`: adds `oncology_journals.specialty`,
  which groups the "Journal RSS feeds" picker into specialty tabs (see
  `lib/catalog/journalWatchSpecialties.ts`). After applying, run
  `npm run backfill:journal-specialty` once to stamp the specialty value onto
  journal rows that already existed in the database (the catalog seed upsert
  uses `ignoreDuplicates: true`, so it won't update pre-existing rows).
- `20260713000000_journal_broadcast_slots.sql`: adds the `journal_broadcast_slots`
  table backing 30-minute single-journal broadcasts (see below). Independent
  of `conference_coverage_slots` — no backfill needed.

`https://conferencehype.com/api/stream/status` is the fastest production check
for the current `youtubeVideoId`, URL, and delivery status.

## YouTube Title/Description/Tags/Category Automation

Each hourly broadcast's YouTube title, description, tags, and category are
built automatically from that hour's actual, final rendered cards
(`lib/youtube/broadcastMetadata.ts`, wired into
`scripts/render-hour-broadcast.ts` and set once at upload time via
`lib/youtube/uploadBroadcastVideo.ts`) so the broadcast surfaces in
search/recommendations for physicians, NPs, and PAs following specific
journals or specialties, instead of a generic always-identical title.

- **Title**: journal name first, followed by a specific clinical topic and a
  readable specialty research hook when one journal clearly
  leads the hour (≥2 cards); falls back to a specialty-only "Roundup" framing
  for a genuinely mixed hour; falls back to today's original generic
  conference-based title when zero cards have resolvable journal data — a
  zero-journal-data hour is never worse off than before this feature.
  **Known issue, diagnosed but not yet fixed (2026-07-19):** the "≥2 cards"
  `dominant` threshold in `resolveTier()` (`lib/youtube/broadcastMetadata.ts`)
  is a flat count, not a share of the hour, so at 90-journal scale a journal
  with a slim plurality (e.g. 7 of 32 cards) still gets crowned as the whole
  hour's title/intro even though the rest of the hour is unrelated
  specialties. Confirmed on a real video (`MRDoPUwUVgk`, titled "JAMA
  Psychiatry - Others" while ~78% of its 32 cards were Nature Medicine, PLOS
  Medicine, JAMA Surgery, JAMA Otolaryngology, JCO Oncology Practice, and
  JAMA Pediatrics). Per-card chapter attribution in the description is
  correct; only the title/intro summarization is wrong. Fix direction:
  require `dominant` to represent a real proportion of resolved cards (e.g.
  ≥40%), falling through to the existing `roundup` tier otherwise.
- **Study-name search optimization (effective July 24, 2026)**: named studies and trials are extracted only when explicitly present in approved card text, citation labels, or the linked PubMed abstract. Registry-only identifiers such as `NCT...`, `ISRCTN...`, and `ACTRN...` are not viewer-facing search terms. Named studies may appear in the description and leading tags, but the journal remains first in the title. Generic phrases such as `this study` or `controlled trial` are rejected, and the system never invents a study name. Metadata refresh updates canonical videos in place without uploading duplicates.
- **Description invariant**: every journal video begins its description with `<Specialty> Journal Club`, then `Journal: ...`, `Relevant specialties: ...`, and an `Audience: ...` line naming the specific specialists plus Physicians and Advanced Practice Providers (APPs). For example, an oncology program begins `Oncology Journal Club` before `Journal: Cancer Discovery.` When named studies are detected, a `Named studies covered: ...` line follows. Journal and source publication month/year remain explicit.
- **Station search-metadata gate**: every newly rendered weekday journal program must pass one validation package before it can be marked verified. The journal begins the title; the description begins with the specific specialty plus `Journal Club`, followed by the journal name; `Multiple Cancers`, `Others`, and registry-only identifiers are rejected from viewer-facing search metadata. Journal name, specific specialty, and publication month/year are mandatory; generic fallback and thumbnail-upload warnings are not accepted for station programs.
- **Description**: explicitly names every journal and its source publication month/year near the top, followed by one YouTube-chapter-formatted line per content card
  (`M:SS Journal - Specialty - Mon YYYY`), which YouTube auto-converts into
  clickable chapters, plus an intro sentence and a closing hashtag line.
- **Specificity rule**: titles, descriptions, hashtags, and tags must never expose the catch-all `Others`; use the journal's actual clinical specialty.
- **Tags/category**: every distinct journal/specialty that aired that hour
  plus fixed medical-education keywords; `categoryId` defaults to Education
  (`"27"`), overridable via `YOUTUBE_BROADCAST_CATEGORY_ID`.
- `BROADCAST_TITLE`/`BROADCAST_DESCRIPTION` env vars still take precedence
  over the automated output when explicitly set (manual/emergency override,
  e.g. via `workflow_dispatch`) — the scheduled/cron path in
  `youtube-stream.yml` deliberately leaves `broadcast_title` unset so the
  automated builder becomes the effective default there.
- `Citation.journalId`/`Citation.publishedAt` are optional fields populated
  going forward at card-creation time (`lib/intakeCards.ts`'s
  `buildBatchSegment`); cards created before this shipped simply lack them
  and degrade to the same generic framing as any other non-journal card —
  never a crash, never a misattributed journal.
- `journalIdFromSourceId()` in `lib/intakeCards.ts` requires a real
  `validJournalIds` set and only ever returns a candidate that's actually in
  it. `isJournalItem()`'s name-regex fallback is imprecise (can fire true on
  a non-journal item whose name merely contains a word like "journal"), so
  candidates are validated against real catalog data before being trusted —
  a false positive can only ever produce "no journal data," never a
  wrong-but-real journal. `buildBatchSegment`'s `journalIds` parameter is
  required (no default), so a missed call site is a compile error, not a
  silent gap.
- Verify without ever calling the YouTube API: `npm run
  preview:youtube-metadata [ISO timestamp]` prints the title/description/
  tags/category that would be generated for a real hour's real approved
  segments.
- `isJournalItem()` also accepts an optional `validJournalIds` set (2026-07-12)
  and checks the bare, unprefixed `sourceId` against it in addition to the
  `daily-journal-` prefix and the name-regex fallback above. Without this, a
  real journal item whose `sourceId` is a bare catalog id — `
  pubMedRescueJournalItems()`'s NCBI `[Journal]`-search fallback, and any
  journal whose name doesn't hit the 8-word regex (most of the 90 journals
  added in the specialty-tab expansion, e.g. "Kidney Medicine") — was
  silently treated as non-journal. That skips the narrative-review exemption
  entirely and forces the item through the strict four-section template, and
  when the source is genuinely thin (an erratum, a case report, a short
  commentary) that template's own honest "needs PubMed or full-record
  confirmation" fallback text is indistinguishable, at the regex level, from
  real intake-failure language — the card becomes permanently unable to pass
  approval. Every caller of `buildPubMedBackedJournalItem` /
  `isClinicalScienceItem` / `buildBatchSegment` threads the same real
  journal-id set through for this reason.
- The same misclassification existed on the social side: `buildBatchSegment`'s
  `socialItem` check only matched `sourceType === "general_social"`, so
  `verified_social` items (X-monitored/verified-account posts) fell through
  to the same forced four-section template — a tweet essentially never has
  real Methods/Results content, so this always produced the same
  permanently-unapprovable text. Fixed by checking
  `sourceType.includes("social")` instead, matching the pattern
  `contentTypeForItem()` already used. The validator's own social-attribution
  check had a related dead regex — `@\w{1,15}` was wrapped in a shared
  `\b...\b` boundary, but `@` is never a word character so that boundary can
  never be satisfied immediately before it, making the alternative
  unreachable in any context even though real social cards commonly carry a
  bare `@handle` as their only attribution marker.
- **Title/description used to drift from what actually aired (fixed
  2026-07-12, structurally eliminated 2026-07-16).** Under the old live-
  broadcast pipeline, `scripts/create-youtube-broadcast.ts` set the initial
  title/description at broadcast-creation time, *before*
  `render-hour-broadcast.ts` finished selecting/framing the actual cards, so
  the two reads could disagree (confirmed on a real broadcast: chapter list
  didn't match the narrated cards, title fell back to a generic placeholder).
  That was patched with a post-render correcting `videos.update` call. Since
  the 2026-07-16 migration to render-then-upload, there's no longer an
  earlier snapshot to drift from at all — the video doesn't exist until
  after rendering finishes, so `buildBroadcastMetadata` only ever runs once,
  against the real, final `cards` list, as part of the upload itself.
- `scripts/backfill-citation-journal-ids.ts` is a one-time backfill for
  citations that predate `Citation.journalId` (or predate the
  `isJournalItem()` bare-id fix above) but whose citation label's
  `"<Journal Name>: <article title>"` prefix unambiguously names a real
  catalog journal — exact case-insensitive match only, no fuzzy matching, so
  a miss just leaves `journalId` unset (safe) rather than risking a wrong
  attribution. A dry run against production found ~545 affected citations.

## YouTube Custom Thumbnails

Beginning July 24, 2026, new and weekday-refreshed journal videos use a higher-contrast curiosity thumbnail. When a verified explicit study name exists, the headline combines that name with `What Did It Find?`; otherwise it uses the non-claiming `What Did This Research Find?`. Thumbnail text comes from the same metadata object as the title, description, and tags, so it cannot independently invent or select a different study.

`app/api/youtube-thumbnail/route.tsx` renders a 1280×720 thumbnail via
`next/og`'s `ImageResponse` (no new dependency — built into Next.js) with
three tiers matching the title's own tiers exactly (dominant journal +
specialty, specialty-only roundup, or the generic ConferenceHype wordmark).
`lib/youtube/uploadBroadcastVideo.ts`'s `uploadYoutubeThumbnail` fetches this
route using the *exact same* resolved metadata already computed for the title
(never a second independent resolution, so title and thumbnail can't
disagree) and uploads it via `thumbnails.set` right after the video upload
succeeds. Wrapped in try/catch — YouTube requires the channel to be
phone-verified before custom thumbnails are accepted (see
`LAUNCH_CHECKLIST.md`'s YouTube section), which can't be confirmed from
code, so an unverified channel just means the thumbnail step silently no-ops
with a logged warning; the upload itself and
title/description/tags/category are all unaffected either way.

### Journal-recognition and CTR thumbnail rule

Beginning with commit `860090c`, every 30-minute single-journal broadcast uses
the dedicated Journal Club thumbnail hierarchy:

1. A large, high-contrast gold-on-red `JOURNAL CLUB` badge, paired with the
   source-resolved specialty and no `CONFERENCEHYPE` wordmark on this layout.
2. The full plain-text journal name and the source issue month/year.
3. The complete primary article title in smaller adaptive type.

The corresponding YouTube title begins `JOURNAL CLUB | <target audience> |`
before the journal name. The audience is resolved from the journal specialty;
for example, Radiology / Radiation Oncology becomes `Radiation Oncologists and
Radiologists`. This ordering is exclusive to single-journal (`journal30`)
videos and is enforced for new uploads and in-place metadata refreshes.
Set `STATION_METADATA_JOURNAL_CLUB_ONLY=1` with the all-released metadata
refresh to update only canonical single-journal videos while leaving weekend
and mixed-program metadata untouched.

The article title is passed separately from the short curiosity headline and
must wrap to fit without truncation or an ellipsis. The journal name and issue
date come from the same source-resolved metadata as the YouTube title and
description. Do not use publisher logos or imply journal endorsement.

This dedicated layout applies only to single-journal (`journal30`) broadcasts.
Mixed programs show no more than the two journals with the most covered cards
and an accurate `+ N JOURNALS` count for the remainder. Weekend roundups retain
that two-name/count rule. Manual breaking-news videos retain `BREAKING MEDICAL
RESEARCH`, and Create a Story / `prepared_story` retains ConferenceHype plus
story-specific branding. When no journal can be source-resolved, the safe
fallback is `MEDICAL RESEARCH`.

CTR is not optimized by misleading copy. When YouTube Studio Test & Compare is
used, compare no more than three truthful variants: journal recognition,
study-result curiosity, and specialty emphasis. Select based on YouTube watch-
time share and first-30-second retention, not raw clicks alone. Automated
YouTube APIs do not expose Test & Compare, so experiments remain an operator
action in YouTube Studio.

### In-video opening title rule

Every newly rendered ConferenceHype video displays its exciting 1280x720
metadata-driven YouTube thumbnail over the first eight seconds of playback.
Narration begins normally underneath it: the opening visual does not add time,
move a card, change audio synchronization, shorten the true-end outro, or alter
the exact 15-, 30-, or 60-minute broadcast frame. The same resolved thumbnail
bytes are then uploaded to YouTube, so the promise viewers click and the title
they see when playback begins cannot drift apart.

This is enforced once in the shared final-render path and therefore applies to
presentation broadcasts, weekday station programs, single-journal broadcasts,
weekend roundups, and manual breaking-news broadcasts. Thumbnail rendering is
retried before publication; a video is not published without its required
opening title visual. Failure of YouTube's separate `thumbnails.set` operation
continues to follow the existing station versus non-station delivery policy and
does not change the already-burned in-video opening.

## YouTube Embed Protection

The main workflow runs `scripts/enable-youtube-embed.ts` immediately after
creating the broadcast. It verifies both:

- the live broadcast has `contentDetails.enableEmbed=true`
- the underlying video has `status.embeddable=true`

It then requests the iframe with the ConferenceHype origin and referrer. The
workflow stops before saving the public video handoff when YouTube returns:

```text
EMBEDDER_IDENTITY_MISSING_REFERRER
Playback on other websites has been disabled
disabled by the video owner
```

For a targeted repair, manually run the **Enable YouTube embedding** workflow
and provide the affected YouTube video ID.

## 30-Minute Single-Journal Broadcasts

### Regional Journal Club series

ConferenceHype has two additive regional series: `JOURNAL CLUB - INDIA JOURNAL
ARTICLES` and `JOURNAL CLUB - UNITED KINGDOM JOURNAL ARTICLES`. They reuse the
current Journal Club badge, typography, colors, evidence dashboard, narration,
source attribution, thumbnail/opening-frame byte stream, and 30-minute frame.
They do not modify or activate the weekday station or weekend wheel.

The India catalog contains 20 curated journals and is scheduled for Tuesday
and Friday at 7:30 PM `Asia/Kolkata`. The United Kingdom catalog contains 22
curated journals and is scheduled for Wednesday and Sunday at 6:30 PM
`Europe/London`. Each program requires 12 unique, substantive PubMed-grounded
cards, excludes cards already reserved by the station or either regional
series, and searches 14, 21, 28, then 35 days without lowering the card floor.

Regional journal membership is explicit in `journal_series_memberships`;
country identity is never inferred from author affiliation or article subject.
New region-only journal rows carry `regional_only=true`, and both weekday
selection paths explicitly reject those rows. Existing UK journals may remain
eligible for their established weekday cadence while also being explicit UK
series members.

`.github/workflows/regional-journal-club.yml` defaults to shadow planning. A
render/upload occurs only when the matching `journal_series.enabled` row is
true **and** `REGIONAL_JOURNAL_CLUB_PUBLISH_ENABLED` (or the manual `publish`
input) is true. The workflow never calls either station activation function and
never writes `stream_state`; successful regional uploads remain independent
YouTube series videos.

### Weekend roundup wheel

Saturday and Sunday use a separate, additive station-planning lane. At 8:00 AM
`America/New_York`, the recurring GitHub Actions workflow ranks only quality-
passed card IDs stored on verified Monday-Friday station programs. Ranking is
deterministic and cost-free: explicit trial or study names, registry IDs,
randomized or phase-trial language, clinically meaningful outcomes, structured
article quality, and numerical results receive additional weight. No LLM is
called. Saturday receives the top 48 cards split into two balanced 24-card,
30-minute programs. Sunday uses 48 cards not selected Saturday when available;
if weekly inventory is lower, it keeps every unused card first and fills only
the remaining positions with the next-best cards already used Saturday.

The two programs begin at 9:00 and 9:30 AM Eastern. After both distinct YouTube
uploads verify, an isolated weekend-only database function repeats those two
canonical videos across the six-position station wheel for that day. It never
changes weekday selection, weekday card status, or the weekday workflow. A
failed render cannot activate a partial weekend schedule, so the previously
verified public player remains available. Monday's normal weekday activation
supersedes the weekend wheel.

Every upcoming weekend program is packaged as a multi-journal Journal Club.
Its YouTube title begins `JOURNAL CLUB | <resolved specialties> |`, followed by
the source-grounded clinical topic and article hook. Its description begins
with `JOURNAL CLUB`, then `Relevant specialties: ...`, before the roundup part,
study, journal, chapter, and source details. The opening thumbnail, persistent
top frame, and in-video evidence-dashboard header use the same
`JOURNAL CLUB | <resolved specialties>` label. Specialties are derived only
from the journals attached to the selected approved cards; they are never
invented, and the weekend metadata gate fails closed when none can be resolved.
This is prospective for all Saturday and Sunday `weekend30` renders. It does
not apply the dedicated single-journal thumbnail layout: weekend artwork still
shows at most two actual journal names plus an accurate `+ N JOURNALS` count.

The description and tags also list explicit trial/study names found in approved
PubMed-grounded content, journals, article chapters, and source context; names
are omitted rather than invented. Each program ends with one roundup conclusion and uses full-length
Funk/Latin music blocks for any unused portion of the 30-minute frame. Weekend
planning budgets 55 seconds per article card, based on measured production
narration, so 24 articles fit without the pre-render planner discarding them;
the measured post-narration reconciler still makes the finished video exactly
30 minutes.

On July 25, 2026, video `6qKRZ1JJG44` exposed the earlier 12-card capacity cap:
its selected cards finished after roughly 12 to 15 minutes and the renderer
correctly filled the remainder with music. The source week contained 72
eligible, actually-broadcast cards, so this was a selection-capacity defect,
not missing intake. The 24-card-per-program invariant and verifier prevent that
failure from recurring.
A second broadcast format, additive to the existing 60-minute mixed-content
hourly show: a `journal_broadcast_slots` row picks one journal for a
30-minute, single-persona show that narrates only that journal's approved
cards, in groups of 4 with a music break after every group and the
disclaimer after every 2nd group — fewer, denser silent gaps than the hourly
format. It runs alongside conference-coverage hours, never replacing them.

Status as of 2026-07-18: Phases A-D (data model, scheduling, render
integration, admin UI) are built, committed, and verified — including a real
render exercised via `HOUR_BROADCAST_DRY_RUN=1` and a live admin-UI slot
creation. Phase E's manual `workflow_dispatch` path (create real broadcast,
render, upload, verify) is wired and has been exercised via many real
`youtube-stream.yml` dispatches, including multiple journal slots per day.
**The `schedule:` cron has deliberately not been switched over to run this
format automatically** — it still only fires the existing hourly/conference
format; every journal broadcast so far has been started manually via the
"Start journal broadcast"/"Run now" buttons in the admin's "Journal-only
broadcasts for this hour" panel. Cutting the cron over to `15,45 * * * *`
and teaching the "Resolve block start time" step to pick up
`journal_broadcast_slots` is the last remaining step, intentionally deferred
until the format has run cleanly enough, for long enough, on manual
dispatch alone.

Key files: `lib/broadcast/journalShowSchedule.ts` (group/music/disclaimer
constants), `lib/rundown/slots.ts`'s `buildJournalShowSlots` /
`personaForJournalShow`, `scripts/render-hour-broadcast.ts`'s `journal30`
mode branch, `components/SingleJournalPicker.tsx` +
`components/DailyCoveragePlanner.tsx`'s "Journal-only broadcasts for this
hour" panels.

Three real bugs were found and fixed while running the first manual test
broadcasts through this new path:

- **Duplicate-article cards.** `buildJournalShowSlots` could schedule the
  same underlying article twice in one show when it existed as two separate
  approved segment rows (e.g. a weekly-digest card and a same-week
  one-hour-batch card both citing the same URL). Fixed by deduping on
  `contentSignature` (extracted into a shared `lib/segments/contentSignature.ts`,
  reused from the hourly format's existing dedup logic) before grouping
  segments into cards.
- **`broadcast_writeouts` alignment check has no row to check for a
  30-minute show.** `broadcast_writeouts` has a hard `duration_minutes = 60`
  check and a FK to `conference_coverage_slots`, so a journal show
  correctly never writes one (`render-hour-broadcast.ts` already guarded
  `saveBroadcastWriteout` behind `!isJournalMode`). What was missed: **two
  separate verification scripts** — `scripts/verify-public-broadcast-alignment.ts`
  and `lib/media/youtubeDeliveryVerifier.ts`'s `assertPublicState` (used both
  mid-stream and at stream completion) — unconditionally required a matching
  writeout row and threw/timed out without one. A real test dispatch got all
  the way through rendering and streaming before failing at this check. Fixed
  by threading a `JOURNAL_SLOT_ID` env var through both scripts and both
  `youtube-stream.yml` verification steps; when set, they confirm the right
  video is public via `stream_state` and skip the writeout lookup entirely,
  rather than requiring a table row that can't structurally exist for this
  format. Other `broadcast_writeouts` consumers (`lib/data.ts`'s
  `findMatchingWriteout`, the admin writeout archive display) were checked
  and already degrade gracefully with no row present, so needed no changes.
- **Silent post-render write failures with useless error logs.** The first
  fully clean end-to-end journal30 test (video `xh77Aljha6o`) still shipped
  with two gaps: the post-render title/description rebuild never landed
  (video stayed on its placeholder title), and the segments used in the show
  never got flipped to `rendered`, leaving them eligible for reuse in a
  future broadcast. Both writes failed within the same ~2-second window in
  `scripts/render-hour-broadcast.ts` while every other network call in the
  same job succeeded — consistent with a transient runner network blip, not
  a deterministic bug. Root-causing this was slower than it should have
  been because both catch blocks logged `${error}`/`String(error)` on plain
  Supabase/fetch error objects, which stringify to `"[object Object]"`
  instead of anything useful. Fixed by adding a `describeError()` helper
  that extracts the error's actual fields, and wrapping both writes (both
  idempotent — safe to repeat) in a short retry via a new `withRetry()`
  helper.
- **A journal with zero approved segments at render time still rendered and
  uploaded a near-silent video.** Confirmed live 2026-07-17 (video
  `YnGo-ddNYv0`): `main()` in `scripts/render-hour-broadcast.ts` had no
  check for "0 content cards scheduled" — it rendered and uploaded
  regardless, so a journal with nothing approved yet produced a
  30-minute video that was just the opening gap-clip stinger followed by
  music, with the generic fallback YouTube title (since title-building also
  requires `usedSegmentIds.length > 0`). Fixed by checking
  `cards.filter(c => !c.isMusic).length === 0` right after building the
  card list — on zero content cards it now aborts *before* the expensive
  ffmpeg render, writes `youtube_status: "failed"` with a specific
  `deliveryError` ("No approved segments were available for this journal at
  render time...") directly to the slot, and exits non-zero. This check
  applies to both the journal30 and the 60-minute hourly path (whichever
  produced zero content cards), not just journal shows.
- **A journal with SOME but not enough approved segments can appear to go
  silent partway through with no explanation.** This was confirmed again in
  the May 2026 Journal of Minimally Invasive Gynecology video
  (`h61Hvrwai4M`), where viewers heard no useful program audio after roughly
  15 minutes. It is a different failure mode from the zero-content case above.
  An earlier reproduction on 2026-07-17 (`JSI7ZF34nF0`) had 11 approved
  segments (a full show needs roughly 20-24):
  `buildJournalShowSlots` narrated all 11 across ~14 minutes, then stopped
  scheduling entirely (its loop exits the moment segments run out, without
  finishing the remaining groups' music breaks), and
  `enforceOneHourFrame`'s existing pad-to-30-minutes behavior filled the
  rest with one uninterrupted ~15-minute music-only block. That padding
  itself is by design (see `lib/broadcast/journalShowSchedule.ts`'s own
  comment); the bug was that nothing told the listener the segment had
  ended. Fixed by having `buildJournalShowSlots` append a spoken sign-off card
  before handing off to the trailing music whenever at least one real card
  was narrated but the show ran out of content before completing all
  `JOURNAL_GROUPS_PER_SHOW` groups. The shared closing identifies the journal
  and issue month/year, asks whether an article was missed or a finding needs
  deeper follow-up, directs comments to `@conferencehype` on X, and asks the
  viewer to share, comment, like, and subscribe. The conclusion is suppressed
  on every intermediate four-card boundary and appears exactly once in the
  final journal outro. Any time remaining after that outro is divided into
  consecutive full-length Funk/Latin music blocks of at most three minutes;
  these use the allow-listed audio files rather than a silent or stretched
  placeholder. The 2026-07-23 production rebuild (`1cLkv39c2ag`) verified one
  closing at position 17 followed by five Funk music cards through the
  remainder of the 30-minute program.
- **Overlapping voices / hard mid-sentence cutoffs.** Card scheduling (slide
  duration and audio placement in `scripts/render-hour-broadcast.ts`) was
  driven entirely by `expandContentDurations`' word-count estimate
  (`~2 words/sec + 5s`), never checked against the real synthesized Kokoro
  clip length. Real narration routinely ran longer than the estimate (the
  1.15x speaking rate and the 0.12s per-line pause aren't in that estimate at
  all), so a card's audio could still be playing when the next card's audio
  was told to start. A flat `+3s` pad on the `atrim` window papered over
  short overruns by letting a card's tail play past its own slot instead of
  being cut off — which is exactly what caused the overlap, since the next
  card's `adelay` start time never moved to account for it. This is
  structurally worse for journal30 than the hourly format: hourly puts a 45s
  music slot after every single voice card, but journal30 only inserts music
  after a whole 4-card group finishes, so 3 of every 4 transitions are
  voice-straight-into-voice with zero buffer to absorb an overrun. Confirmed
  live on video `MRDoPUwUVgk`. Fixed 2026-07-19: TTS synthesis now runs
  *before* slide generation and timeline placement (previously last), each
  unique voice clip's real duration is measured via `probeAudioDurationSeconds()`
  (decodes with `ffmpeg -i <file> -f null -` and reads the last `time=`
  progress line — no ffprobe dependency needed), and every voice card's
  `duration` is corrected to `ceil(realSeconds) + 0.4s` before slides/offsets
  are computed, with leftover positive slack still flowing forward into a
  following music card exactly as `expandContentDurations` already did. The
  `atrim` window is sized to this real duration directly, so the `+3s` guess
  pad was removed entirely. Verified via `tsc`, `verify-broadcast-guards.ts`,
  `npm run build`, and a `journal30` dry run — not yet verified against a
  live audio render; do that via manual `workflow_dispatch` before relying on
  it for a real slot.
- **Cron cutover to journal30 reaffirmed pending, 2026-07-19.** Explicitly
  revisited after the overlap fix above — decided to keep both formats
  running rather than replace the hourly cron with journal30. Reasons: (1)
  journal30 has no content-volume fallback by design (a thin journal means a
  short show or, with the empty-content guard, no show at all), while hourly
  always has something to air via its cross-journal approved pool plus
  schedule/social-voice fallback; (2) journal picking is manual, not
  auto-rotated, so journal30-only would roughly double daily operator slot
  actions (48 half-hour slots vs. 24 hourly ones) with no guarantee all ~90
  journals get airtime; (3) journal30 has no conference-coverage support at
  all, so replacing hourly would remove ConferenceHype's ability to cover a
  live conference; (4) journal30 has only ever run via manual
  `workflow_dispatch` test broadcasts, never as the sole unattended
  cron-driven format. None of this blocks a future cutover to *add* journal30
  to the cron alongside hourly — it's specifically "replace hourly entirely"
  that was rejected.

## Automation Cadence

- `generate.yml`: hourly, including fresh ingestion
- `ingest.yml`: daily safety pull
- `upcoming-events.yml`: every six hours
- `youtube-stream.yml`: hourly continuation check and manual dispatch. Every
  scheduled broadcast must run the verifier loop after streaming; if the loop
  cannot prove the rendered MP4, YouTube live/completed state, saved YouTube
  video, Supabase stream state, saved writeout, and `conferencehype.com` all
  match the same video ID, the broadcast process is still broken and must keep
  failing/retrying until fixed.
- `weekly-source-cards.yml`: low-cost weekly ready-card pre-generation for every enabled conference, journal RSS feed, and clinical news/newspaper source. It fetches the configured source catalog once, creates deterministic pending-review cards without LLM expansion by default, and tags them as the weekly ready-card pool. When an operator selects that conference, journal, or news source for an hour, unused weekly cards are shown and reused first; newly generated cards only fill remaining space. Cards already scheduled/broadcast are not reused ahead of unused weekly cards. If any enabled source has no weekly card, the generator must create a viewer-facing context card for that source, the verifier must fail, and the daily loop must run the weekly-card repair step until every enabled source has an unused weekly ready card.
- `daily-verification-loop.yml`: the single daily verification loop. It runs
  typecheck, broadcast guards, RSS feed verification, weekly source-card verification, the Complete RSS card scheduling report, randomized platform smoke,
  public stream handoff resolution, YouTube delivery verification, and automatic
  repair/retry passes before reporting failure. The automatic repair passes are:
  refresh ingestion and rerun RSS verification after source failure; verify weekly source cards and rerun weekly-card generation if any enabled source is missing an unused weekly ready card; report the Complete RSS card scheduling result daily; rerun the
  randomized platform smoke loop after smoke failure; run a short smoke repair
  pass and resolve the public handoff again when `conferencehype.com` does not
  expose a live/completed YouTube ID; set the YouTube video privacy to `public`
  and rerun delivery verification after delivery failure. Only unresolved
  failures after those repair passes open a GitHub issue and fail the workflow.
- `platform-smoke-loop.yml`: manual targeted randomized platform smoke repair.
  The daily schedule lives in `daily-verification-loop.yml`.
- `youtube-delivery-daily-verify.yml`: manual targeted YouTube delivery repair.
  It accepts the render-then-upload terminal `queued` state, then independently
  verifies the saved YouTube video, public privacy, database handoff, and site
  exposure before reporting success.
- `youtube-enable-embed.yml`: manual repair for a specific video
- `briefing.yml`: manual
- `render-media.yml`: manual or configured media render

## Verification

Local checks:

```powershell
npm install
npm run typecheck
npm run test:guards
npm run test:rss
npm run build
```

Delivery check loop (post-migration: single-pass upload verification, no more
`live`/`completed` phases):

```powershell
$env:YOUTUBE_VIDEO_ID="<video id>"
npm run verify:youtube-delivery
```

Full randomized platform smoke loop:

```powershell
npm run verify:platform-smoke
```

In GitHub Actions the smoke loop dispatches `youtube-stream.yml`, waits for the
stream workflow to finish, and then verifies the uploaded/queued video. A
successful run must include content cards and music cards in the saved
`broadcast_writeouts` record.

A configured workflow or a YouTube watch page alone does not prove a successful
upload. Before declaring it good, verify:

1. The render contains both video and audio streams
   (`assertMediaGenerated` in `lib/media/youtubeDeliveryVerifier.ts`).
2. The upload step logs `Uploaded <url>, public immediately.`.
3. The uploaded video's `status.uploadStatus` is `processed`/`uploaded` (not
   `deleted`/`failed`/`rejected`), and `status.privacyStatus` is `public`.
4. `stream_state.youtube_video_id`/`youtube_status` and the matching
   `broadcast_writeouts` row agree on the same video ID (`youtube_status`
   should be `queued`).
5. The YouTube watch page finds the video by ID and it's already publicly
   playable (no `private`/scheduled-release wait — uploads go public
   immediately as of 2026-07-17).
6. Confirm `conferencehype.com` shows "Live now" / the correct "Current
   topic" once the slot's scheduled window arrives (derived from wall-clock
   time against the slot's own window, not a stored `live` status — see
   `deriveDisplayYoutubeStatus`/the currently-airing-slot check in
   `lib/data.ts`). If multiple slots are queued at once, confirm the site
   features whichever one's window actually contains "now", not just
   whichever was queued most recently.
7. After the show's scheduled end time, confirm the public site's "Current
   topic" section stops showing (source degrades gracefully back to
   approved segments), with the saved YouTube video still reachable.

## Deployment

1. Apply pending Supabase migrations.
2. Run the local verification commands.
3. Commit and push the release to GitHub.
4. Deploy `main` to Vercel.
5. Confirm `conferencehype.com`, `/admin/login`, and `/api/stream/status`.
6. Approve the desired programming in admin.
7. Start an unlisted rehearsal.
8. Complete all live and completed verification checks above.

## Failure Recovery

- **The site shows the wrong video:** compare `/api/stream/status` with the
  workflow video ID and confirm the Supabase service credentials are present.
- **The iframe says playback is disabled:** run the targeted embed repair,
  verify `YOUTUBE_EMBED_ENABLED=true`, and confirm the iframe origin and
  referrer guard test passes. If YouTube rejects an embed metadata toggle with
  `invalidEmbedSetting`, the iframe preflight remains the source of truth.
- **The site shows an old replay after a failed start:** `/api/stream/status`
  should report `failed` and no stale YouTube ID for the attempted broadcast.
  The workflow records failures for continuous/manual runs even when no coverage
  slot ID exists.
- **The site shows a direct YouTube button instead of an iframe:** embedding is
  disabled in Vercel or the deployment has not picked up the environment
  change.
- **Start selected hour fails:** verify `GITHUB_DISPATCH_TOKEN` can dispatch
  Actions, `GITHUB_DISPATCH_REPO` names the correct repository, and the selected
  hour is not more than one hour in the past.
- **OAuth returns access denied:** add the signing-in Google account as an OAuth
  test user or publish/verify the consent screen as appropriate.
- **A scheduled hour does not publish:** confirm the slot is enabled, approved,
  in the future, and still has `youtube_status = not_scheduled`.
- **No generated cards:** inspect ingestion logs, LLM credentials, source
  selections, and exclusions. For journal cards specifically, also check for
  NCBI PubMed `429` rate-limit responses — a journal can have a healthy RSS
  feed full of real items and still fall back to the generic "no new tracked
  articles" card if PubMed enrichment was throttled or found no exact title
  match.
- **RSS verification fails:** disable or replace the failed official feed.
- **The same article produces more than one card in the same week:** check
  the conference/journal/source catalog for a duplicate row by name first —
  seed reconciliation conflicts on URL, not name, so correcting a feed URL
  can silently orphan a stale duplicate row that keeps generating its own
  cards. Weekly card generation also re-checks for an existing match
  immediately before saving, as a backstop against an overlapping run.
- **The same card plays more than once in one hour:** check for duplicate
  approved rows sharing a citation URL or script text (see the
  content-signature dedup note under "Broadcast Presentation") before
  assuming it's a scheduling bug.
- **Broadcasts feel sparse, or bonus-card gap filling stops finding
  content:** check how many segments are currently `status = "approved"`
  (`select count(*) from segments where status = 'approved'`). Since
  segments now transition to `rendered` after actually airing (see
  "Production Flow" step 14), the approved pool only drains — it never
  refills itself. If continuous mode has been running without matching card
  approval, this count can get very low (confirmed near-empty, 2 rows,
  during testing on 2026-07-09). Run **Create one-hour batch cards**, **Run
  weekly batch now**, or **Run real-AI batch now** to replenish it, or check
  why the `pending_review` backlog isn't being approved.

## Safety

ConferenceHype is interactive AI commentary only. It is not reporting,
journalism, medical education, clinical guidance, scientific validation, legal
advice, or financial advice. Source attribution and operator review remain
required for broadcast programming.
