# ASCO Hype

ConferenceHype is a Next.js medical-event commentary website, admin dashboard,
media generator, and YouTube RTMP broadcast pipeline. The first programming
focus is oncology, building on the ASCO 2026 pilot.

This README describes the code currently on GitHub `main`. Sections labeled
**Recommended, not implemented** are operational improvements and must not be
read as current behavior.

## Source Of Truth

- GitHub repository: `lijosimpson/ConferenceHype`
- Authoritative branch: `main`
- The checked-in code and workflows on GitHub are the implementation source of
  truth.
- This README documents the implementation. It does not override code.
- Before changing deployment or broadcast behavior, compare the local checkout
  with `origin/main`.

## Product Boundaries

- ASCO Hype is interactive AI conference commentary.
- It is not medical education, clinical guidance, scientific validation,
  journalism, legal advice, or financial advice.
- It is not associated with the American Society of Clinical Oncology.
- Public disclaimers live on the website and Terms page rather than being
  repeated in every spoken card.
- Voice output converts `ASCO` and `ASKO` to `Ask-oh`.
- Scripts must not give medical or investment advice.
- Abstract/science commentary and exhibitor/company commentary are separate
  content types.

## Application Stack

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS
- Supabase for sources, ingested items, segments, stream state, media assets,
  and analytics
- GitHub Actions for ingestion, generation, rendering, and YouTube streaming
- OpenAI-compatible chat completions for LLM generation
- Kokoro Python TTS, locally or through an optional HTTP service
- FFmpeg for slide rendering, audio mixing, MP4 creation, and RTMP publishing

## Public Site

The public player chooses media in this order:

1. `NEXT_PUBLIC_AUDIO_STREAM_URL`
2. YouTube channel/live embed
3. `NEXT_PUBLIC_HLS_URL`
4. A stream-warming placeholder

`NEXT_PUBLIC_YOUTUBE_CHANNEL_ID` is preferred. If it is absent, the code uses
the configured default channel ID. The YouTube iframe reloads every 90 seconds
until it observes a playing state.

When Supabase reports an emergency override, the player displays the emergency
state instead of the normal player.

## Admin Dashboard

The admin page is dynamic and defaults to the current one-hour Eastern Time
slot. Navigation covers approximately 24 hours backward and seven days
forward.

The dashboard includes:

- One-hour presentation sequence
- Oncology `Journal Watch` and `Meeting Watch` programming desks
- An editorial `Memory` library for developed one-hour programs
- Ready and human-review cards
- Atomic exact-slot replacement and drag/drop scheduling
- Card rejection and discard actions
- Admin-created URL, social, emergency, sponsor, and free-text cards
- Source and monitored-X management
- A clear `Specialty X Voices` tab with delete/disable controls
- A `Conferences` tab grouped by month and year
- Conference-day coverage planning in three-hour blocks
- Aired history
- Voice and recording views
- GitHub Actions stream dispatch through `GITHUB_DISPATCH_TOKEN`

The admin Start Stream action dispatches `.github/workflows/youtube-stream.yml`
with a start time and one of these durations: 5, 15, 30, 60, or 180 minutes.
The scheduled workflow polls saved conference coverage every 15 minutes and
only starts a three-hour render when a selected coverage block is approaching.

### Specialty X Voices

The specialty directory supports up to 20 ranked X voices for every configured
medical specialty. Trusted society and conference accounts provide the initial
baseline. Real ingested X engagement supplies scores and future rankings; the
system must not invent handles or fake activity merely to fill all 20 positions.
Operators can add a voice, change its rank, or remove an inappropriate voice
from the dedicated tab.

The X ingestion job rotates specialty voices through query batches so the
combined monitor stays within the X API query-length limit. A specialty may
show fewer than 20 voices until enough real candidates have been reviewed.

### Conference Coverage

The conference catalog groups major meetings by month, year, and specialty.
Operators can add or update meetings and select exact coverage dates when a
verified date range is available.

Each selected conference day starts with two three-hour coverage blocks,
defaulting to 09:00 and 15:00 in the conference timezone. Operators can add
more three-hour blocks up to eight blocks, covering the full 24-hour day.
Outside saved conference coverage blocks, the normal verified default
broadcast rundown remains active.

Conference records without exact start and end dates are catalog entries only.
Their official dates must be entered before day-level coverage can be saved.

Card replacement is one database transaction: the displaced card returns to
human review and the replacement card is approved at the selected timestamp.
This avoids the previous partial state where scheduling succeeded but removing
the displaced card failed.

### Oncology Journal Watch

The Journal Watch tab contains a managed list of oncology and hematology journal
RSS feeds. The initial verified feed list is:

- Journal of Clinical Oncology
- JCO Precision Oncology
- JCO Oncology Practice
- The Lancet Oncology
- The Lancet Haematology

The generation job checks enabled journals and develops at most one newly
detected edition per cycle. This rate limit avoids launching many expensive LLM
jobs at once while still processing every journal automatically over successive
cycles.

Each edition becomes a one-hour package with four sections:

1. Issue Headlines
2. Study Designs and Findings
3. Context and Limitations
4. Editorials, Correspondence, and What to Watch

Each section contains 15 source-grounded cards. The full package therefore
contains 60 content cards. The existing presentation renderer adds the
prespecified 20-second music transition after every card. The first card
includes: `Hi this is the ConferenceHype channel Journal Watch focussing on
[Journal Name].`

Journal packages remain in Editorial Memory until an operator selects a start
time and adds the package to the broadcast schedule.

### Oncology Meeting Watch

Meeting Watch lists upcoming oncology and hematology conferences from the
conference catalog, including ASCO, AACR, ESMO, ASH, and EHA 2026. Admins can
add or update meetings in the same tab and then choose `Develop material`.

Each Meeting Watch package contains:

1. Abstract Watch
2. Exhibition Booths and Industry Floor
3. Conference and Social Chatter
4. Media Watch

The generator may discuss only material present in the supplied official,
media, or attributed social sources. A lack of source material causes package
development to fail visibly rather than filling sections with invented
abstracts, booth activity, or conference reactions. The first card includes:
`Hi this is the ConferenceHype channel Meeting Watch on [Conference Name] and
date [Date].`

### Editorial Memory

Editorial Memory is the review library for all developed Journal Watch and
Meeting Watch packages. Operators can expand all four sections, inspect every
script and source, select a broadcast start, and convert the package into 60
approved minute-aligned cards. A package cannot be scheduled twice.

Memory is editorial workflow storage, not model training memory and not proof
that a generated statement is independently verified.

The production YouTube workflow renders this database-backed presentation
sequence. A selected conference block begins with a source-attributed conference
coverage card and then uses the approved/default rundown. The older three-block
news/social/pharma renderer remains available for manual experiments but is not
the production default.

### Sponsor Content

Sponsor messages require the legal sponsor name, always enter human review, and
are tagged as paid content. Approval is blocked unless the title, summary, or
script explicitly labels the card as sponsored or paid content. Sponsor copy
must remain separate from editorial conference commentary and must not imply a
ConferenceHype clinical or commercial endorsement.

## Source Ingestion

`.github/workflows/ingest.yml` runs every 15 minutes and can also be dispatched
manually.

Current sources include:

- Official ASCO pages
- ASCO Daily News
- The ASCO Post
- OncLive
- STAT News
- X recent search
- Operator-added sources
- Manual Instagram watchlist input

The X recent-search query includes:

- `#ASCOHype`
- `#AskASCOHype`
- `#ASCO26`
- `#ASCO2026`
- Posts from monitored X accounts

The query is trimmed to remain within the X Basic tier 512-character limit.
The current query does not separately search mention terms for
`@ASCOHypeAI` or `@ConferenceHype` unless those accounts are included as
monitored `from:` voices.

Fetch failures are logged as warnings instead of being silently discarded.

## Segment Generation

`.github/workflows/generate.yml` runs every 15 minutes.

The generator:

- Builds genuinely rewritten, source-backed cards from ingested items
- Prioritizes The ASCO Post, social items, OncLive, and other sources
- Auto-approves primary cards from The ASCO Post, OncLive, STAT News, and
  monitored X voices
- Sends other eligible cards to human review
- Keeps citations and source labels on generated segment records
- Rejects generated copy containing long verbatim passages from a source title
  or excerpt
- Blocks legacy excerpt-copy cards from the default broadcast rotation

Every generated card must preserve supplied names, dates, numbers, and trial
identifiers while omitting facts that are not present in the source. It must
not infer clinical importance, outcomes, causation, recommendations, or
consensus. Passing these checks reduces hallucination risk; it does not make an
LLM output independently verified journalism.

The official upcoming-events spine runs every 20 minutes through
`.github/workflows/upcoming-events.yml`. The recap briefing workflow runs every
75 minutes.

## Presentation Sequence Renderer

The database-backed presentation renderer is `buildCards()` in
`scripts/render-hour-broadcast.ts`.

It reads approved and pending segments, schedule segments, and social
leaderboard segments, then calls `buildBroadcastSlots()`.

Current timing:

- 40-second content card
- 20-second music card after every content card
- 60 content/music pairs per hour
- 180 content cards and 180 music cards in a three-hour render

Content scripts are cleaned and limited to roughly 90 words. Persona assignment
is deterministic across the 17 personas using the segment ID and slot index.
Each voice card starts with a time-appropriate greeting, identifies the
assigned voice as being from ConferenceHype, names the card topic, and ends
with the standard `@conferencehype` conference-coverage invitation.

When no content is available, the renderer inserts an official schedule bridge.

## Optional Scheduled Block Renderer

The renderer can optionally be invoked with:

`HOUR_BROADCAST_MODE=blocks`

This selects the separate `buildBlockCards()` experimental path. The production
YouTube workflow does not use it because it does not honor the admin
presentation sequence.

Each hour contains three 20-minute blocks:

1. ASCO Daily News
2. Social Desk
3. Pharma News

Each 20-minute block contains:

- 2 minutes of schedule cards
- 2 minutes of music-led transition cards
- 16 minutes of block-specific content

The block content uses 40-second content cards followed by 20-second music
cards. News uses `echo-sage`, Social Desk alternates `echo-sage` and
`nova-quinn`, and Pharma News uses the company-watch persona `aether-vale`.

When `LLM_API_KEY` is configured, a three-hour scheduled render attempts three
generation requests per hour, for nine requests total. Without a key, the
generators use source-derived fallback copy. Recent media and social data are
fetched once and reused across those hours. The Pharma News block filters recent
media for pharmaceutical, biotechnology, drug-development, regulatory, company,
and oncology-treatment terms. It attributes factual claims to the supplied
sources and does not use the static exhibitor directory.

Important current limitation: this block path creates narration directly for
the render. It does not pass through the database presentation queue or
`filterBroadcastReadySegments()`.

## Recommended Daily Broadcast Planner

**Recommended, not implemented.**

The authenticated admin currently presents one one-hour rundown at a time.
A stronger planning page should make every broadcast day and hour visible while
keeping the existing exact-slot scheduling APIs as the first implementation
building block.

Recommended layout:

1. Add a `Planner` admin tab with a date picker and previous/next-day controls.
2. Display the selected day as 24 collapsible hourly rows.
3. Divide every hour into Daily News, Social Desk, and Pharma News blocks.
4. Show each block as an ordered timeline of content and music cards.
5. Let operators add an existing ready/review card or create a new content card
   directly inside a selected block.
6. Add an explicit `Insert music` action between any two content cards.
7. Support drag/drop reordering within a block and moving cards between blocks.
8. Show planned duration, filled duration, gaps, overlaps, source status, and
   validation warnings for every block.
9. Provide `Copy previous hour`, `Copy previous day`, and reusable block-template
   actions for rapid scheduling.
10. Require a preview and validation pass before an hour can be marked `Ready`.

Recommended data model:

- `broadcast_days`: planning date, timezone, status, and notes
- `broadcast_blocks`: day, hour, block type, title, position, and status
- `broadcast_cards`: block, card type (`content` or `music`), position,
  duration, segment reference, inline script, source metadata, and music asset
- Store ordering explicitly instead of inferring it only from
  `segments.approved_at`.
- Keep music as a first-class card so an operator can select a licensed asset,
  set duration, preview it, and insert it exactly where needed.

Recommended operator safeguards:

- Prevent overlapping cards and highlight unfilled time.
- Require citations for Pharma News and other factual content.
- Label company press releases separately from independent media coverage.
- Prevent the same story or music asset from repeating too frequently.
- Lock an hour while it is rendering or publishing.
- Record who changed each card and when.

## Voice And Audio

The project uses Kokoro rather than ElevenLabs.

- `KOKORO_PYTHON_CMD` selects the Python executable.
- `VOICE_API_URL` enables optional hosted Kokoro HTTP mode.
- Persona environment variables map 17 personas onto configured Kokoro voices.
- The Python batch mode loads the model once and creates all uncached cards.
- MP3 voice files are cached by persona environment key and processed script.
- Roman numerals are expanded where appropriate.
- URLs, handles, hashtags, internal process labels, and troublesome punctuation
  are cleaned before TTS.

The renderer mixes:

- A continuous low-volume music bed
- Delayed per-card voice audio
- Four rotating licensed 20-second gap clips

If Kokoro batch generation fails, the renderer logs a warning and continues
with music-only output.

## YouTube Publishing: Current Behavior

`.github/workflows/youtube-stream.yml` currently:

1. Installs Node dependencies, FFmpeg, and Kokoro dependencies.
2. Resolves a three-hour block start.
3. Starts a temporary fallback RTMP stream only for the calculated 7 AM Eastern
   opener.
4. Renders the complete MP4.
5. Stops the opener fallback.
6. Streams the rendered MP4 to YouTube through FFmpeg.

The rendered MP4 publisher:

- Loops the MP4 input
- Maps the MP4 video and its existing audio
- Publishes H.264/AAC FLV to the configured RTMP target
- Uses 30 fps and a two-second keyframe interval
- Fails if FFmpeg exits within 15 seconds

The simpler fallback publisher uses `npm run job:stream`, loops
`STREAM_INPUT_PATH`, and prints a redacted FFmpeg command.

### Current Scheduling Limitations

- The checked-in YouTube cron dates cover May 29 through June 3, 2026 only.
  They do not run after those dates.
- GitHub scheduled workflows can begin late; the workflow does not wait for an
  exact broadcast boundary after rendering.
- Rendering and streaming happen in the same job.
- Scheduled jobs have a 235-minute timeout that includes setup, rendering, and
  a requested 180-minute stream.
- Manually dispatched jobs use the selected stream duration as the entire job
  timeout, so setup and rendering reduce the available streaming time.
- No workflow concurrency group prevents two jobs from publishing to the same
  YouTube stream key.
- Only the morning opener receives fallback coverage during rendering.
- Late jobs are not intentionally skipped. If a job starts late, current
  behavior is to render and broadcast the selected content when ready.
- The scheduled workflow uses the block renderer rather than the admin
  presentation sequence.

## Recommended YouTube Reliability Fix

**Recommended, not implemented.**

Continuous coverage is preferred over skipping a late slot. Outdated content is
acceptable when the alternative is a hole in the broadcast.

Recommended design:

1. Split preparation and publishing into separate workflows.
2. Render each MP4 well before its intended broadcast time.
3. Upload the prepared MP4 as durable storage or a GitHub artifact.
4. Start a lightweight publishing workflow shortly before the target time.
5. If the publishing job is early, wait until the target UTC timestamp.
6. If it is late, start immediately. Do not skip the slot.
7. Keep the previous stream or fallback loop active until the prepared stream is
   ready.
8. Add a single RTMP publisher lock:

```yaml
concurrency:
  group: youtube-live-publisher
  cancel-in-progress: false
```

9. Give the publishing-only job enough timeout for the complete stream plus
   startup and shutdown buffer.
10. Add retries or fallback-loop recovery when FFmpeg exits with broken pipe or
    another RTMP failure.
11. Validate the rendered asset with `ffprobe` before stopping the fallback.
12. Confirm the YouTube live event is public or unlisted and associated with
    the configured stream key.
13. Log the intended start, actual start, render duration, stream PID, FFmpeg
    progress, and final exit reason.

Recommended renderer alignment:

- Choose one authoritative broadcast content path.
- If the admin presentation sequence is authoritative, remove
  `HOUR_BROADCAST_MODE=blocks` from the publishing workflow and render with
  `buildCards()`.
- Alternatively, have block generation create validated database cards and
  place them into the presentation sequence before rendering.
- In either design, run generated narration through source, duplicate, banned
  language, and citation validation before TTS.

## GitHub Workflows

- `ingest.yml`: source ingestion every 15 minutes
- `generate.yml`: review-card generation every 15 minutes
- `upcoming-events.yml`: deterministic schedule spine every 20 minutes
- `briefing.yml`: recap briefing every 75 minutes
- `render-media.yml`: manually dispatched media render
- `youtube-stream.yml`: manually dispatched or date-limited scheduled render
  and RTMP publication

## Environment

Start from `.env.example`.

Required for the full hosted pipeline:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SHARED_SECRET`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `X_BEARER_TOKEN`
- `GITHUB_DISPATCH_TOKEN`
- `YOUTUBE_RTMP_URL`
- `YOUTUBE_STREAM_KEY`
- Persona `VOICE_*` variables

Optional public playback:

- `NEXT_PUBLIC_AUDIO_STREAM_URL`
- `NEXT_PUBLIC_YOUTUBE_CHANNEL_ID`
- `NEXT_PUBLIC_YOUTUBE_VIDEO_ID`
- `NEXT_PUBLIC_HLS_URL`

## Local Commands

```powershell
npm install
npm run dev
npm run build
npm run typecheck
npm run job:ingest
npm run job:generate
npm run job:briefing
npm run job:upcoming
npm run job:narrative
npm run job:render
npm run job:stream
```

Dry-run the fallback RTMP command without connecting:

```powershell
$env:STREAM_DRY_RUN="1"
$env:STREAM_DURATION_SECONDS="10800"
npm run job:stream
```

## Deployment

- Public site: `https://conferencehype.com`
- Admin dashboard: `/admin`
- Vercel hosts the Next.js app.
- Supabase stores operational data.
- GitHub Actions performs background jobs and RTMP publishing.
- YouTube Studio controls live-event visibility, recording, stream-key mapping,
  and public availability.

## Verification Checklist

Before treating a broadcast change as complete:

1. Confirm local `HEAD` matches GitHub `main`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Run the RTMP command with `STREAM_DRY_RUN=1`.
5. Verify a rendered MP4 contains video and audio with `ffprobe`.
6. Confirm no other publisher is using the same stream key.
7. Confirm emergency override is inactive.
8. Confirm YouTube Studio is receiving the intended stream and the public live
   URL resolves.
9. Verify FFmpeg advances near real time for several minutes.
