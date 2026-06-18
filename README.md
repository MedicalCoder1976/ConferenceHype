# ConferenceHype

ConferenceHype is a source-attributed medical-conference broadcast system. It
collects selected conference, journal, clinical-news, and social material,
builds an operator-controlled presentation, renders the program, publishes it
to YouTube, and exposes the same broadcast on `conferencehype.com`.

## Production Flow

1. The operator selects conferences, journals, news sources, priorities,
   exclusions, custom coverage, and approved presentation slots.
2. Scheduled ingestion and generation create source-attributed review cards.
3. The operator edits, orders, approves, rejects, or atomically replaces cards.
4. In Daily coverage decisions, **Create one-hour batch cards** drafts cards
   for the selected hour. The **Cards scheduled** status confirms those cards
   were copied into the selected hour as approved scheduled cards.
5. **Start selected hour** dispatches the YouTube workflow from the admin
   rundown preview start time. The plan/preview buttons do not start or confirm
   a broadcast.
6. With OAuth configured, each run creates and binds a fresh YouTube broadcast.
7. Before public handoff, the workflow enables embedding and tests the exact
   ConferenceHype embed request.
8. The program is rendered and validated for both video and audio.
9. Supabase `stream_state` receives the current YouTube ID, URL, and delivery
   status. The public site reads this state dynamically.
10. FFmpeg publishes the rendered MP4 to the bound YouTube RTMP endpoint.
11. While FFmpeg is still running, the workflow loops until it verifies the
    rendered video, YouTube live state, Supabase public stream state, and
    `conferencehype.com` all point to the same video ID.
12. After FFmpeg finishes, the workflow loops again until the saved YouTube
    video/archive remains available, the public stream state and saved writeout
    still match the same YouTube video ID, and the final public status is
    `completed`.

The fixed RTMP URL and key are a legacy fallback. The normal production path is
the OAuth-created fresh broadcast.

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
- Broadcast audio reads the visible card text/summary shown above **FULL
  PREPARED TEXT**. Do not use the expanded full prepared script as the spoken
  source unless the operator explicitly asks for that behavior.
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
  display that card as content.
- Journal-review cards begin their substantive content with: "From the
  [Month] edition of [Journal Name]". They should condense the abstract,
  methods, results, and discussion into broadcast language rather than merely
  reading the article headline.
- Article, abstract, journal, and clinical-news cards must be PubMed-first when
  a PubMed record can be found. Use the complete PubMed abstract to write
  specific Background, Methods, Results, and Discussion content. Do not build
  article cards from RSS issue metadata alone.
- For abstract and journal cards, the voiced narration itself must explicitly
  say Background, Methods, Results, and Discussion. Voice framing and word
  trimming must not remove any of the four section labels.
- Conference and meeting cards must not read URLs or page code. If an official
  meeting page exposes script text instead of readable content, discard the
  code-like text and fall back to the official page title/description or a
  neutral official-schedule summary.
- Hourly rising social voice cards must contain actual monitored voices,
  leaderboard entries, or operator-curated watchlist voices. Do not ship a
  placeholder that says there is no content.
- The full disclaimer is placed on a dedicated notice approximately every
  15 minutes instead of being repeated in every segment.
- Transition audio rotates through six 20-second tracks:
  four licensed voiced stingers in `public/music/gap-clips` and two generated
  preview tracks in `public/music`.
- Active scripts and data use general ConferenceHype branding. Retired
  conference-specific branding was removed from current content.
- When a rendered MP4 is streamed, FFmpeg maps the MP4's own video and audio.
  It does not layer separate voice or music inputs over the finished program.

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
- Start or stop continuous YouTube delivery.
- Inspect YouTube status, video links, workflow links, and delivery errors.

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

### Records

- **Writeouts:** ordered spoken cards, sources, YouTube and workflow links,
  delivery state, and errors for each render.
- **Memory:** developed packages waiting for an operator-assigned start time.
- **Specialty X Voices:** curated and operator-added voices, blacklist
  controls, and a real-ingestion leaderboard with no fabricated rankings.
- **Talked About:** previously covered segments.

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

## Database Migrations

Apply every file in `supabase/migrations` in filename order. Important current
migrations include:

- `20260614005000_public_youtube_delivery.sql`: public YouTube handoff and
  persistent continuous-feed state
- `20260615173849_remove_legacy_conference_content.sql`: removes retired
  conference-specific content from active data

`https://conferencehype.com/api/stream/status` is the fastest production check
for the current `youtubeVideoId`, URL, and delivery status.

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
- `youtube-delivery-daily-verify.yml`: daily safety verification for the
  current public YouTube handoff. It requires public visibility, retries after
  automatically repairing YouTube privacy to `public`, and opens a GitHub issue
  with the failing verifier output if the delivery path is still broken.
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

Delivery check loop:

```powershell
$env:YOUTUBE_VIDEO_ID="<video id>"
$env:YOUTUBE_VERIFY_PHASE="live" # or completed
npm run verify:youtube-delivery
```

Audio-mapping dry run:

```powershell
$env:STREAM_DRY_RUN="1"
$env:STREAM_VIDEO_PATH="public/rendered/conferencehype-hour-broadcast.mp4"
npx tsx scripts/youtube-hour-presentation-stream.ts
```

A configured workflow or a YouTube watch page alone does not prove a successful
practice stream. Before declaring the stream visible on both sides, verify:

1. The embed preflight passed for the new video ID.
2. The render contains both video and audio streams.
3. FFmpeg output is advancing without refused, forbidden, unauthorized,
   broken-pipe, or competing-publisher errors.
4. The workflow reports
   `YOUTUBE_RTMP_STABLE: FFmpeg remained connected for 30 seconds.`
5. `YOUTUBE_LIVE_DELIVERY_VERIFIED` appears, proving the generated MP4,
   YouTube live record, YouTube saved/reachable video record,
   `/api/stream/status`, saved writeout, and `conferencehype.com` all match the
   same YouTube video ID. If YouTube cannot find the saved video by ID, the
   process is not working and the workflow must fail.
6. The YouTube watch page shows the same live program at the same time.
7. After the hour finishes, the workflow's **Verify completed YouTube handoff**
   loop passes and `/api/stream/status` reports `completed` for that same
   YouTube video ID, with the saved YouTube video still reachable.

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
  selections, and exclusions.
- **RSS verification fails:** disable or replace the failed official feed.

## Safety

ConferenceHype is interactive AI commentary only. It is not reporting,
journalism, medical education, clinical guidance, scientific validation, legal
advice, or financial advice. Source attribution and operator review remain
required for broadcast programming.
