# ConferenceHype

ConferenceHype is a source-attributed medical-conference broadcast system. It
collects selected conference, journal, clinical-news, and social sources;
develops reviewed programming; renders one-hour videos; publishes them to
YouTube; and automatically displays the current YouTube video on
`conferencehype.com`.

## Production Flow

1. The admin chooses the day's conferences, journals, news sources, priorities,
   exclusions, and custom coverage items.
2. Scheduled ingestion and generation collect source material and create review
   cards.
3. The admin orders, edits, approves, rejects, or replaces cards in the one-hour
   presentation rundown.
4. The admin approves conference programming by slot, day, or week.
5. **Start continuous feed** launches the first YouTube hour and enables
   automatic hourly continuation.
6. Each workflow creates a fresh YouTube broadcast, stores its video ID in
   Supabase, renders the program, and streams it.
7. The public site reads the current video ID from Supabase, so new YouTube
   videos appear without changing a Vercel environment variable.
8. **Stop continuous feed** prevents future hourly broadcasts; the current hour
   is allowed to finish.

## Public Site

- Lightweight YouTube player with audio/HLS fallbacks
- Current source-grounded topic
- `#ConferenceHype` and `@conferencehype` audience routing
- Vercel Web Analytics page-visitor tracking
- Vercel Speed Insights real-user performance tracking
- Emergency override display

The home page is dynamic so a newly created YouTube video ID is read on every
request. The player prefers the database video ID, then the configured fallback
video ID, then the channel-level live embed.

## Admin Sections

### Broadcast

- Select daily conferences, journal RSS feeds, clinical-news sources, custom
  URLs, priority topics, exclusions, and breaking-news behavior.
- Edit and order a one-hour presentation sequence.
- Drag review cards into exact content slots.
- Approve, reject, discard, or atomically replace cards.
- Focus a social or sponsor item for review.
- Manage source URLs and X follows.
- Activate an emergency override.
- Start or stop the continuous feed.
- Review legacy internal event, clip, and queue counts.

### Journal Watch

- Review all managed journal feeds.
- Add a journal with an official RSS/Atom URL.
- Develop the latest issue into a four-section editorial package.
- Automatic generation checks enabled feeds and creates at most one new issue
  package per run to control LLM cost.

Run `npm run test:rss` to make a live request to every seeded journal feed and
fail if any feed is unavailable, empty, or unparseable.

Seeded feeds currently include:

- Journal of Clinical Oncology
- JCO Precision Oncology
- JCO Oncology Practice
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

### Meeting Watch

- Review the medical-conference catalog.
- Develop an oncology/hematology meeting package.
- Add or update conferences.
- Choose dates and one-hour coverage slots.
- Approve an individual slot, an entire day, or the next seven days.
- View YouTube delivery status, video links, workflow links, and errors.

The seeded catalog includes broad medical meetings plus oncology/hematology
coverage such as AACR, ASCO, EHA, ESMO, ASH, ASTRO, EBMT, SITC, SIOG, and
SABCS. Exact dates should be added only from official conference sources.

### Writeouts

Every render saves the ordered spoken cards, source links, delivery state,
YouTube URL, workflow URL, and errors. This is the broadcast record.

### Memory

Developed Journal Watch and Meeting Watch packages remain here until an
operator assigns a broadcast start time.

### Specialty X Voices

- Curated specialty voice directory
- Operator-added X follows
- Blacklist controls
- Real-ingestion leaderboard; no fabricated rankings
- Reporter and voice configuration

### Talked About

Archive of previously covered segments.

## Required Services

- Vercel: Next.js site, admin API, Web Analytics, Speed Insights
- Supabase: editorial data, programming plans, delivery state, writeouts
- GitHub Actions: ingestion, generation, rendering, and YouTube publishing
- YouTube OAuth: fresh broadcast creation and binding
- LLM provider: script generation
- X API: optional social search
- Kokoro: broadcast TTS during render

## Environment Variables

Required in Vercel production:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SHARED_SECRET
GITHUB_DISPATCH_TOKEN
GITHUB_DISPATCH_REPO
NEXT_PUBLIC_YOUTUBE_CHANNEL_ID
```

Required in GitHub Actions:

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
YOUTUBE_RTMP_URL
YOUTUBE_STREAM_KEY
X_BEARER_TOKEN
```

Optional fallbacks:

```text
NEXT_PUBLIC_YOUTUBE_VIDEO_ID
NEXT_PUBLIC_AUDIO_STREAM_URL
NEXT_PUBLIC_HLS_URL
YOUTUBE_PRIVACY_STATUS
```

Use `.env.example` as the local template. Never commit secret values.

## Database Migrations

Apply every file in `supabase/migrations` in filename order. The public-player
handoff requires `20260614005000_public_youtube_delivery.sql`, which adds the
current YouTube delivery fields and the persistent continuous-feed flag to
`stream_state`.

## Automation Cadence

- `generate.yml`: hourly; performs a fresh ingestion before generation
- `ingest.yml`: daily safety pull
- `upcoming-events.yml`: every six hours
- `youtube-stream.yml`: hourly continuation check plus manual dispatch
- `briefing.yml`: manual only
- `render-media.yml`: manual or configured media render

Manual workflow dispatch remains available when urgent coverage should not wait
for the scheduled cadence.

## Cost Controls

The largest costs are GitHub runner minutes, LLM calls, YouTube rendering time,
and optional paid API quotas. Current controls:

- One hourly generation run replaces separate 15-minute ingestion and
  generation loops.
- Standalone ingestion runs once daily because generation already ingests.
- Upcoming-event refresh runs every six hours.
- Legacy briefing is manual only.
- YouTube polling runs once hourly, aligned to one-hour broadcasts.
- Journal Watch develops at most one unseen issue per generation run.
- Source and segment limits cap database writes and LLM fan-out.
- Public delivery remains YouTube-first and bandwidth-light, avoiding a second
  paid video CDN.
- Web Analytics and Speed Insights use Vercel's first-party integration rather
  than an additional analytics vendor.

Continuous YouTube publishing still consumes runner time for rendering and the
one-hour RTMP process. Stop the feed when coverage is not needed.

## Local Verification

```powershell
npm install
npm run typecheck
npm run test:guards
npm run test:rss
npm run build
```

Broadcast audio mapping dry run:

```powershell
$env:STREAM_DRY_RUN="1"
$env:STREAM_VIDEO_PATH="public/rendered/conferencehype-hour-broadcast.mp4"
npx tsx scripts/youtube-hour-presentation-stream.ts
```

When `STREAM_VIDEO_PATH` is set, the FFmpeg command must map only the MP4 video
and audio. It must not layer extra voice or music inputs.

## Deployment

1. Apply pending Supabase migrations.
2. Run the complete local verification commands.
3. Merge the release branch into `main`.
4. Deploy `main` to Vercel.
5. Confirm `conferencehype.com`, `/admin/login`, and `/api/stream/status`.
6. Confirm Vercel Analytics and Speed Insights receive a production visit.
7. In admin, select daily coverage and approve any scheduled programming.
8. Click **Start continuous feed**.
9. Confirm the workflow creates a YouTube video and the same video appears on
   `conferencehype.com`.

## Failure Recovery

- **YouTube video exists but the site shows another video:** check
  `/api/stream/status` for `youtubeVideoId`; verify the public-delivery
  migration is applied and the workflow has Supabase service credentials.
- **Start continuous feed fails:** verify `GITHUB_DISPATCH_TOKEN` has Actions
  workflow permission and `GITHUB_DISPATCH_REPO` is correct.
- **RSS test fails:** disable or replace the failing feed before relying on it.
- **No generated cards:** check source-ingestion logs, LLM credentials, daily
  coverage selections, and exclusions.
- **Admin redirects to login:** use the current `ADMIN_SHARED_SECRET`.
- **A scheduled hour does not publish:** confirm the slot is enabled, approved,
  and still has `youtube_status = not_scheduled`.

## Safety

ConferenceHype is interactive AI commentary only. It is not reporting,
journalism, medical education, clinical guidance, scientific validation, legal
advice, or financial advice. Source attribution and operator review remain
required for broadcast programming.
