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
- Narration style: pronounce `ASCO` as `ASKho`/`Ask-ho`, never as the individual letters A-S-C-O. Pronounce `cholangiocarcinoma` as `COLANGIOCARCINOMA` ("colangio-carcinoma"); the `ch` is a hard `k` sound and must not be read as "cho". Pronounce `Ib` and `1b` as `one B`. Pronounce `ECOG` as a word (`EE-kog`), not individual letters. Expand `PR` to "partial response", `CR` to "complete response", `pCR` to "pathologic complete response", and `WHO` to "World Health Organization" when spoken. Spell `NCI` out as individual letters ("N-C-I"). Cancer-staging notation (Roman numeral immediately followed by a letter, e.g. `IA`, `IIA`, `IIIB`, `IVA`) is read as the cardinal number plus the letter — `IA` as "one A", `IIA` as "two A", and so on.
- Broadcast closing: never narrate "That is it for this segment." The close must identify the journal and issue month/year, invite viewers to report a missed article or name a finding that deserves deeper follow-up by tagging `@conferencehype` on X, and ask viewers to like the video and subscribe. This shared close applies to every newly rendered broadcast, including the early-ending outro used when a 30-minute journal show runs out of approved articles.
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
- Approve, reject, discard, or atomically replace cards.
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

### Meeting Watch

- Manage the medical-conference catalog.
- Add exact dates only from official conference sources.
- Choose one-hour coverage slots.
- Approve an individual slot, a day, or the next seven days.
- Develop source-grounded meeting packages.

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

The OAuth consent screen must allow the Google account used to create the
refresh token while the app is in testing. The OAuth client must include
`https://developers.google.com/oauthplayground` as an authorized redirect URI
when OAuth Playground is used to obtain that token.

Rotate the OAuth client secret and refresh token immediately if either is
exposed in chat, logs, screenshots, or source control.

### Renewing the YouTube refresh token

While the OAuth consent screen is in Testing publishing status, Google
auto-revokes the refresh token after 7 days — this will recur until the app
is verified and published to production. Two things make this manageable
instead of a recurring multi-step manual ordeal:

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

- **Title**: dominant journal + specialty + date when one journal clearly
  leads the hour (≥2 cards); falls back to a specialty-only "Roundup" framing
  for a genuinely mixed hour; falls back to today's original generic
  conference-based title when zero cards have resolvable journal data — a
  zero-journal-data hour is never worse off than before this feature.
- **Description**: one YouTube-chapter-formatted line per content card
  (`M:SS Journal - Specialty - Mon YYYY`), which YouTube auto-converts into
  clickable chapters, plus an intro sentence and a closing hashtag line.
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
- **A journal with SOME but not enough approved segments went completely
  silent partway through with no explanation.** A different failure mode
  from the zero-content case above: confirmed live 2026-07-17 (video
  `JSI7ZF34nF0`) with 11 approved segments (a full show needs ~20-24) —
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
  viewer to like and subscribe. A fully-stocked show uses the same close at
  its normal four-card boundary.

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
  The daily schedule lives in `daily-verification-loop.yml`.
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
