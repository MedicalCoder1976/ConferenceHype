# ASCO Hype Operating Policies

ASCO Hype is an interactive AI conference-commentary website and broadcast system for ASCO 2026. The product must behave like a source-attributed conference follow-along desk, not like medical education, journalism, clinical interpretation, or unsourced social chatter.

This README is the policy source of truth for the website, admin dashboard, generation jobs, presentation sequence, voice output, YouTube stream, and source intake.

## Core Identity

- ASCO Hype is interactive AI commentary only.
- ASCO Hype is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice.
- ASCO Hype is not associated with the American Society of Clinical Oncology in any way.
- The full disclaimer belongs on the public website and terms page.
- The full disclaimer must not be repeated in every broadcast statement.
- The disclaimer may be mentioned briefly about once per hour when appropriate.
- ASCO must be pronounced as "ASKO" or "Ask-oh" in voice output.

## Broadcast Source Rules

- No broadcast statement may be based on vague, unsourced, or unverified buzz.
- Never create fake news, fake doctors, fake experts, fake speaker names, fake quotes, fake institutions, or fake source claims.
- Do not use placeholder doctor names such as "Dr. Patel" or "Dr. Rivera" unless that exact person is present in the provided source.
- Do not say or imply that ASCO Hype has independently verified data.
- Spoken scripts must not use: "air", "aired", "airing", "airtime", "verified", or "we verify".
- Preferred phrasing is source-attributed language such as "reported", "posted", "discussed", "source-backed", "monitored X voice", or "according to the linked source".
- Abstract/science material and exhibitor/company chatter must be separated.
- Abstract chatter may discuss abstracts, trials, posters, biomarkers, disease tracks, presenters, and source-attributed scientific discussion.
- Exhibitor chatter may discuss booths, sponsor/product floor activity, company showcases, and operator-approved commercial messages.
- Market or company commentary must not contain buy, sell, hold, investment, or financial recommendations.

## Source Priority

Ready-card and broadcast priority must be:

1. The ASCO Post when relevant items appear.
2. The highest-traction monitored X/Twitter accounts, up to the top 50.
3. OncLive.
4. STAT News.
5. Other operator-approved RSS feeds, media outlets, official pages, company updates, and source-backed URLs.

Official ASCO schedule/session/location information remains the schedule spine and may be inserted at required schedule intervals.

## X, Social, and Media Intake

- The system must search and ingest posts mentioning `#ASCO26`, `#ASCO2026`, `#ASCOHype`, `#AskASCOHype`, `@ASCOHypeAI`, and `@ConferenceHype` when API credentials allow it.
- The system must monitor added X users and approved media/news sources.
- Operators must be able to add X users and news/RSS sites in the admin section.
- Popular high-traction ASCO social accounts must be added automatically to the X voices to call out list when they clear the source and bot filters.
- Social voice competition accounts must have a blacklist button next to each name.
- Blacklisted social accounts must be excluded from future social voice competition and automatic source intake.
- Monitored X voice callouts may enter the presentation sequence without manual approval when source-attributed.
- Commentary from the social voice competition must be added to the X voices to call out list before reuse as a monitored voice callout.
- General hashtag or audience chatter must not be broadcast unless it is source-attributed, operator-approved, or tied to a monitored X voice.
- Instagram intake is manual/operator controlled unless a compliant provider/API is added later.

## Ready Cards and Human Review

- Every 15 minutes, source ingestion and generation should keep more than 10 cards available across ready cards and human review when current source material exists.
- Brand new ready cards are the only cards outside the presentation queue.
- Ready cards must be brand-new replacement candidates, not a second copy of already scheduled cards.
- When a ready card is placed into the presentation sequence, it must disappear from ready cards and appear in the exact selected content slot.
- Cards must never disappear from ready cards without being written into the selected presentation slot or failing visibly with an error.
- Human review cards must be source-backed and broadcast-ready or clearly rejected from broadcast use.
- Approval for broadcast must remove the card from the pending review queue.
- Pending review being marked OK means the system may move the card forward, but it still must obey all source, fake-name, voice, and schedule policies.
- Every card must expose prepared text and sources.
- Every presentation card must have a Reject button.
- Rejecting a card must remove it from the visible presentation sequence.

## Presentation Sequence

- The admin presentation sequence is the single place where scheduled broadcast cards live.
- The left pane must show only the 3-hour presentation block with content slots and music slots.
- The right pane top must show brand new ready cards and the human review queue.
- Each 3-hour block must be completely populated.
- No content slot should be empty; if there is no suitable source-backed card, a safe official schedule bridge or music must fill the space.
- Time slots must be 3-hour blocks across the day: 21:00-00:00, 00:00-03:00, 03:00-06:00, 06:00-09:00, and continuing every 3 hours.
- Planning blocks must exist for the next 2 weeks.
- Each 3-hour block must have 3 full hours of visible cards, not 2 hours.
- The 3-hour scrollbar must allow operators to go backward and review cards that already played.
- Every content card is 1 minute 50 seconds.
- Every content card is followed by a 10-second music card.
- Every hour must contain 30 content cards and 30 music cards.
- Every 3-hour block must contain 90 content cards and 90 music cards.
- Music slots are not content slots and must not accept dropped ready cards.
- Every card should have a Replace button.
- Brand new ready cards should have a Replace with this button.
- Replacement workflow: click Replace on a presentation queue card, then click Replace with this on a brand new ready card.
- Swapping must place the new card into the exact selected slot and remove the old card from that slot.
- Operators must also be able to drag cards into valid content slots.
- Selecting a presentation time slot and clicking a human review card must move that card to approved and place it in that exact slot.

## Scheduled Segments

- Every 20 minutes, include a brief rundown of ongoing and upcoming sessions with locations.
- Schedule/location rundown segments should be brief and should run for about 2 minutes with locations.
- Location narration must tell listeners to check the ASCO app and on-site signage because rooms and locations can change.
- Once per hour after the schedule is announced, include a 2-minute segment naming rising social media voices and who they are.
- The social voice segment must be source-attributed and must not imply clinical validation.
- The three-hour social voice leaderboard may broadcast automatically as information is source-backed.
- The social voice leaderboard frequency is every 3 hours unless changed by an operator.
- Music should play every 5 minutes where the schedule calls for a music break or when a content gap must be filled.
- Every hour starts from scratch using the current cards as the narrative pool.

## Voice and Narration Rules

- Delete and do not reuse old recorded intros.
- No canned intros or repeated host banter.
- Every voice may read any card. Voice assignment is random across the card pool: each content slot is assigned one of the 17 persona voices via a deterministic hash of the segment ID and slot index, so any voice can land on any card and the spread feels random across a broadcast block.
- The voice API for each persona is called at render time to read the prepared script for that slot. Voice API identifiers are configured per persona via environment variables (`VOICE_ECHO_SAGE`, `VOICE_NOVA_QUINN`, etc.).
- Every card should start with: "`Voice name` here from ASCO." Then go directly into the narrative.
- There must be a strict no-repeat policy during broadcast.
- Speakers must not overlap.
- Keep a clear 1-2 second gap between speakers.
- Handoffs should be limited to one brief line from the prior speaker and a quick intro by the next speaker.
- Narration must focus on the ASCO material, source, location, and reason it matters to conference followers.
- Avoid repeated disclaimers in voice scripts.
- Avoid filler such as vague floor energy unless tied to a real source, official schedule item, operator statement, sponsor message, or monitored X voice.

## Admin Break-In Content

- Admins must be able to add a URL, X tweet, free-text statement, emergency message, or sponsor message.
- Sponsor messages must be clearly sponsor-labeled and separate from editorial ASCO commentary.
- Emergency and sponsor messages may be free-texted and read by the narrator.
- Admin-created cards may optionally repeat every 30 minutes for a defined number of repeats.
- Admin-created cards may be read by any available voice.
- Admin-created cards must still obey banned phrase, fake-name, and source-label policies.

## Aired History and Accountability

- The admin history tab must show everything that was talked about.
- Each talked-about item must include a timestamp.
- The talked-about section must include an area listing each X account or person mentioned on ConferenceHype and the time they were mentioned.
- Operators must be able to inspect what played in the past even after the current block advances.

## YouTube and Website Stream Rules

- Starting a stream from admin must trigger the render and YouTube RTMP workflow.
- When the stream starts, it must appear on YouTube and on `conferencehype.com`.
- The public website must use the current channel/live embed or another current live URL, not a stale finished video ID.
- If YouTube Studio is receiving RTMP but the public video is private, unavailable, or mapped to an old event, the system must report that as a YouTube event-state blocker.
- Stream keyframes must be sent every 4 seconds or less.
- Preferred keyframe interval is 2 seconds.
- The encoder must fail visibly if FFmpeg exits immediately instead of falsely reporting success.
- The stream must be recorded when YouTube recording is enabled for the live event.
- If the YouTube link or embed cannot be confirmed, stop or avoid starting public stream operation until the link and embed are confirmed.

## Music and Media Rules

- Use licensed, purchased, or otherwise cleared music for broadcast transitions.
- Do not rely on synthetic beep-style filler as the main music identity.
- Music must have reserved 10-second cards in the presentation sequence.
- Music gaps must not cause speaker overlap.
- Screen visuals must be present in rendered video, not audio-only unless explicitly running audio saver mode.
- Video rendering must include visible card/topic visuals and not a blank screen.

## Admin Layout Rules

- Voice-related cards and settings belong in a separate Voices tab.
- The broadcast admin view must prioritize the presentation sequence and ready/review cards.
- The left half/pane is for the 3-hour presentation sequence.
- The right top pane is for brand new ready cards and human review.
- Source management must allow adding X users and news sites.
- Social voice competition must show ranked voices, what they are known for, and blacklist controls.

## Generation and Cost Rules

- Deterministic pipelines should be the broadcast core whenever possible.
- The official ASCO schedule/index should provide the no-token schedule spine.
- LLM generation must be used only when it adds useful narration and must still obey source restrictions.
- The system must prefer source-backed card generation over repeated host chatter.
- If there are no valid sources, create a safe schedule bridge or music slot rather than invented content.

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
npm run job:render
npm run job:stream
```

## Deployment Notes

- Public site: `https://conferencehype.com`
- Admin dashboard: `/admin`
- Vercel hosts the app.
- Supabase stores segments, sources, approvals, social voices, blacklist data, and schedule state.
- GitHub Actions runs ingest, generation, render, and YouTube streaming jobs.
- YouTube Studio must expose the active RTMP event as public or unlisted for the website embed to work.
