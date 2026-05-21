# ASCO Hype Launch Checklist

This is the operator checklist for getting the app online.

## 1. Create Supabase

1. Go to Supabase and create a new project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Run `supabase/seed.sql`.
5. Open Project Settings > API.
6. Copy:
   - Project URL
   - anon public key
   - service role key

## 2. Create Admin Secret

Create one long password for the operator dashboard.

Example shape:

```txt
asco-hype-admin-long-random-value-change-me
```

Use it as `ADMIN_SHARED_SECRET`.

After it is set, `/admin` redirects to `/admin/login`.

## 3. Create GitHub Repo

```powershell
git init
git add .
git commit -m "Initial ASCO Hype app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 4. Add GitHub Secrets

In GitHub:

`Repo > Settings > Secrets and variables > Actions > New repository secret`

Add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SHARED_SECRET`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `X_BEARER_TOKEN`
- `ELEVENLABS_API_KEY`
- `YOUTUBE_RTMP_URL`
- `YOUTUBE_STREAM_KEY`

## 5. Deploy Vercel

1. Go to Vercel.
2. Import the GitHub repo.
3. Add the same environment variables from `.env.example`.
4. Deploy.
5. Visit `/admin/login` and sign in with `ADMIN_SHARED_SECRET`.

## 6. Create The Social Loop

Use these in the public site and X profile:

- `#ASCOHype`
- `#AskASCOHype`
- `#ASCO26`
- `@ASCOHypeAI`
- watched X voices: `@ASCO`, `@ASCOPost`, `@OncLive`, `@statnews`

Create or rename the X account to match the bot handle before launch.

## 7. YouTube Stream Setup

1. Verify the YouTube channel.
2. Enable live streaming at least 24 hours before launch.
3. Create an unlisted test stream.
4. Add the YouTube video ID to `NEXT_PUBLIC_YOUTUBE_VIDEO_ID`.
5. Add RTMP values to the worker environment.

## 8. Music

1. Add a licensed track to `public/music/light-jazz-techno.mp3`.
2. Put the license details in `public/music/README.md`.
3. Confirm the license covers website, YouTube, and social clip use.

## 9. Smoke Tests

Run:

```powershell
npm run typecheck
npm run build
$env:ASCO_UPCOMING_NOW="2026-05-29T12:55:00-05:00"; npm run job:upcoming
$env:ASCO_BRIEFING_NOW="2026-05-29T14:30:00-05:00"; npm run job:briefing
npm run job:ingest
npm run job:generate
```

Then verify:

- Public site loads.
- Terms page loads.
- `/admin` requires login after `ADMIN_SHARED_SECRET` is set.
- ASCO 20-minute upcoming-events spine creates an approved no-token segment from `data/asco2026/core-index.json`.
- ASCO 75-minute briefing creates one pending review segment from `data/asco2026/core-index.json`.
- Ingest job pulls RSS and hashtag posts.
- Generate job creates review segments.
- Approval updates the public queue.
- Emergency override changes stream state.

## 10. Launch Rehearsal

Before May 25:

- Run a 2-hour unlisted stream.
- Test emergency override.
- Test one social post with `#ASCOHype`.
- Test one generated clip.
- Confirm disclaimers and Terms links are visible.
