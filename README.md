# ASCO Hype

ASCO Hype is an AI-powered, reporter-style oncology conference coverage channel for ASCO 2026. It is built as a media/commentary product: it tracks official sources, reputable media, company updates, exhibitor activity, and monitored social posts, then routes generated segments through human review before anything airs.

## What This Is

- A Next.js 15 public channel and protected operator dashboard.
- A review-gated editorial workflow for AI-generated conference commentary.
- A monitored hashtag, bot mention, X voice loop, and Instagram push-prep loop: `#ASCOHype`, `#AskASCOHype`, `#ASCO26`, `@ASCOHypeAI`, plus reviewed posts from watched X voices such as `@ASCO`, `@ASCOPost`, `@OncLive`, and `@statnews`.
- A low-cost deployment shape: Vercel for the app, Supabase for data/auth/storage, GitHub Actions for scheduled jobs, and a small stream worker for FFmpeg/YouTube.

## What This Is Not

ASCO Hype is not medical advice, clinical advice, scientific validation, legal advice, or financial advice. Every segment must include:

> ASCO Hype is AI-generated conference commentary for informational and entertainment purposes only. It is not medical, clinical, scientific, legal, or financial advice. Always consult qualified professionals and primary sources.

## Local Setup

```powershell
npm install
npm run dev
```

Open:

- Public channel: `http://localhost:3000`
- Operator dashboard: `http://localhost:3000/admin`

The app runs in mock mode without credentials. Add `.env.local` values when you are ready to connect real services.

## Production Setup

Use [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) as the step-by-step operator checklist.
Use [LOW_BANDWIDTH.md](./LOW_BANDWIDTH.md) for the conference-bandwidth operating rule.

### 1. GitHub

Create a GitHub repo and push this project.

Add repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `X_BEARER_TOKEN`
- `ELEVENLABS_API_KEY`
- `YOUTUBE_RTMP_URL`
- `YOUTUBE_STREAM_KEY`

GitHub Actions:

- `Ingest sources`: runs every 30 minutes.
- `Generate ASCO upcoming-events spine`: runs every 20 minutes and creates the main no-token schedule segment from the preprocessed ASCO schedule and abstract index.
- `Generate ASCO 75-minute recap briefing`: runs every 75 minutes and creates the short "what happened / what is next" agenda segment from the preprocessed ASCO schedule and abstract index.
- `Generate review segments`: runs hourly for media, social, exhibitor, and background programming.
- `Render media`: manual until media storage and worker deployment are finalized.

## ASCO 2026 Batch Backbone

The recurring schedule desk is intentionally no-token for the main broadcast spine. The local ASCO schedule workbook and abstracts CSV are preprocessed into `data/asco2026/core-index.json`. The upcoming-events job creates a prepared segment every 20 minutes without an LLM call:

- next 20 minutes: sessions attendees may want to catch next
- a small number of matching abstract records for context
- deterministic copy that is safe to run as the main daily broadcast spine

The 75-minute recap job is a separate, broader desk segment:

- last 75 minutes: sessions that just wrapped
- next 60 minutes: larger forward look
- can use the configured LLM for a more natural recap script

Run locally:

```powershell
npm run job:upcoming
npm run job:briefing
```

For a local smoke test outside the live ASCO dates:

```powershell
$env:ASCO_UPCOMING_NOW="2026-05-29T12:55:00-05:00"; npm run job:upcoming
$env:ASCO_BRIEFING_NOW="2026-05-29T14:30:00-05:00"; npm run job:briefing
```

The raw source files should stay local/operator-controlled. Do not paste whole workbooks, full abstract exports, or full article bodies into prompts.

Programming rule:

- The 20-minute upcoming-events spine is the core broadcast every day.
- Social posts, `#ASCOHype`, X, Instagram-style posts, OncLive, STAT News, The ASCO Post, and exhibitor/company updates interrupt that spine only as reviewed media/social segments.
- Instagram is treated as an operator/manual social watchlist and caption/reel prep path by default unless a compliant provider/API is added later.

### 2. Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Run `supabase/seed.sql`.
4. Enable email auth for admin users.
5. Create private storage buckets for rendered segments and clips.
6. Copy URL, anon key, and service role key into GitHub and Vercel secrets.

### 3. Vercel

1. Import the GitHub repo.
2. Add the values from `.env.example`.
3. Deploy from `main`.
4. Set `NEXT_PUBLIC_AUDIO_STREAM_URL` for the lowest-bandwidth public player.
5. Set `NEXT_PUBLIC_HLS_URL` when the low-bitrate fallback playlist is available.
6. Set `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` when the YouTube stream is created.

### 4. YouTube

1. Verify the YouTube channel.
2. Enable live streaming at least 24 hours before launch.
3. Create a scheduled ASCO Hype live event.
4. Store the RTMP URL and stream key as secrets.
5. Rehearse with an unlisted stream before the public launch.

### 5. ElevenLabs or TTS Provider

1. Use a plan/license that allows your intended publishing and commercial use.
2. Pick one voice per persona.
3. Add voice IDs to the `VOICE_*` environment variables.

## Source Policy

Priority order:

1. Official ASCO agenda and abstracts.
2. Reputable oncology and medical media.
3. Company and exhibitor statements.
4. Verified or high-credibility social accounts.
5. General social posts, hashtags, and bot mentions.

Social posts are always labeled as social buzz unless confirmed by stronger sources.

## Hashtag and Bot Mention Flow

Ask users to post with:

- `#ASCOHype`
- `#AskASCOHype`
- `#ASCO26`
- `@ASCOHypeAI`
- watched X voices: `@ASCO`, `@ASCOPost`, `@OncLive`, `@statnews`

The X ingestion job searches those terms, creates `social_signal` source items, and sends generated commentary to the human review queue. Operators must approve or edit scripts before airing.

Instagram posts, reels, and caption ideas can be pasted into the admin Instagram panel. They are treated as manual social signals, generate review-gated commentary, and can use the caption starter for outward posts asking viewers to tag `#ASCOHype` and `#ASCO26`.

## Useful Commands

```powershell
npm run dev
npm run build
npm run typecheck
npm run job:ingest
npm run job:generate
npm run job:briefing
npm run job:upcoming
npm run job:render
```

Streaming worker:

```powershell
npm run job:stream
```

That command expects `ffmpeg`, `STREAM_INPUT_PATH`, `YOUTUBE_RTMP_URL`, and `YOUTUBE_STREAM_KEY`.

## Launch Checklist

- Confirm Supabase schema and admin login.
- Confirm RSS ingestion works.
- Confirm X hashtag ingestion works.
- Confirm Instagram manual intake and caption prep works.
- Confirm generated scripts include citations and disclaimer.
- Confirm social posts are labeled as buzz.
- Confirm market segments contain no buy/sell/hold recommendations.
- Confirm approval is required before public queue visibility.
- Add licensed music to `public/music/light-jazz-techno.mp3`.
- Render one full segment with voice, music bed, captions, and disclaimer.
- Generate one 30-60 second clip from an approved segment.
- Run a 2-hour unlisted YouTube rehearsal.
- Test emergency override.
- Test fallback HLS playlist.
- Confirm final public stream embed in Vercel.

## Current MVP Notes

The code intentionally supports mock mode so the app is runnable before credentials are configured. The next production hardening step is replacing the mock data reads/writes in `lib/data.ts` and admin API routes with Supabase table operations.
