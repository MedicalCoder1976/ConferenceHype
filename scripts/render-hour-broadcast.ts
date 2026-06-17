import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import ffmpegPath from "ffmpeg-static";
import {
  formatVoiceSegment,
  stripBroadcastDisclaimer
} from "@/lib/broadcast/voiceSegment";
import { defaultDisclaimer } from "@/lib/generation/disclaimers";
import type { BroadcastWriteoutCard, ContentType, Segment } from "@/lib/types";

const durationSeconds = Number(process.env.HOUR_BROADCAST_SECONDS ?? 3600);
const renderDir = process.env.HOUR_BROADCAST_DIR ?? "public/rendered/hour-broadcast";
const outputPath =
  process.env.HOUR_BROADCAST_OUTPUT ?? "public/rendered/conferencehype-hour-broadcast.mp4";
const musicPath =
  process.env.HOUR_BROADCAST_MUSIC ??
  "public/music/conferencehype-gap-music-6min-v3.mp3";
const voicePath = process.env.HOUR_BROADCAST_VOICE;

loadEnvConfig(process.cwd());

type Card = {
  duration: number;
  isMusic: boolean;
  gapClipPath?: string;
  personaId?: string;
  personaName?: string;
  contentType?: ContentType;
  title?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  script?: string | null;
  text: string;
};

const DISCLAIMER_INTERVAL_SECONDS = 15 * 60;
const BROADCAST_DISCLAIMER =
  `${defaultDisclaimer} ConferenceHype is independent and is not affiliated with conference organizers, presenters, sponsors, or exhibitors.`;

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} exited with code ${code}`));
      }
    });
  });
}

function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/%/g, " percent")
    // Rule 1: strip URLs from slide text
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    // Rule 3: strip internal process labels
    .replace(/\boperator[- ](?:added|selected)\b[^.!?\n]*/gi, "")
    .replace(/\bmonitored\s+X\s+(?:voice|narrative|voices)\b/gi, "")
    .replace(/\bsource[- ]backed\s+\w+\s+narrative\b/gi, "")
    .replace(/\bapproved\s+for\s+broadcast\b/gi, "")
    .replace(/\baudience\s+tip\b/gi, "")
    // Rule 4: ≈ → "approx." on slide (shorter than "approximately" for screen space)
    .replace(/≈/g, "approx.")
    .replace(/\bwe verify\b/gi, "we attribute")
    .replace(/\bverify\b/gi, "check")
    .replace(/\bverified\b/gi, "sourced")
    .replace(/\bairtime\b/gi, "the rundown")
    .replace(/\baired\b/gi, "covered")
    .replace(/\bairing\b/gi, "playing")
    .replace(/\bair\b/gi, "play")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function wrapLine(line: string, width: number) {
  const words = cleanText(line).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function formatCard({
  eyebrow,
  title,
  body,
  source
}: {
  eyebrow: string;
  title: string;
  body: string;
  source?: string;
}) {
  const lines = [
    eyebrow.toUpperCase(),
    "",
    ...wrapLine(title, 43).slice(0, 3),
    "",
    ...wrapLine(stripBroadcastDisclaimer(body), 58).slice(0, 10)
  ];

  if (source) {
    lines.push("", ...wrapLine(`Source: ${source}`, 64).slice(0, 2));
  }

  return lines.join("\n");
}

function formatTransitionCard(nextLabel?: string) {
  return formatCard({
    eyebrow: "ConferenceHype live",
    title: nextLabel ? `${nextLabel} continues shortly` : "Coverage continues shortly",
    body: "Stay with ConferenceHype for the next source-attributed update."
  });
}

function applyPresentationPolicy(cards: Card[]) {
  let elapsedSeconds = 0;
  let nextDisclaimerAt = DISCLAIMER_INTERVAL_SECONDS;

  return cards.map((card) => {
    const startsAt = elapsedSeconds;
    elapsedSeconds += card.duration;

    if (card.isMusic) {
      return {
        ...card,
        text: formatTransitionCard()
      };
    }

    const cleanedScript = card.script
      ? stripBroadcastDisclaimer(card.script)
      : card.script;
    const cleanedCard = {
      ...card,
      script: cleanedScript,
      text: stripBroadcastDisclaimer(card.text)
    };

    if (startsAt < nextDisclaimerAt) {
      return cleanedCard;
    }

    while (nextDisclaimerAt <= startsAt) {
      nextDisclaimerAt += DISCLAIMER_INTERVAL_SECONDS;
    }

    return {
      ...cleanedCard,
      personaId: "echo-sage",
      personaName: "Echo Sage",
      contentType: undefined,
      title: "Important ConferenceHype notice",
      sourceLabel: undefined,
      sourceUrl: undefined,
      script: BROADCAST_DISCLAIMER,
      text: formatCard({
        eyebrow: "ConferenceHype / important notice",
        title: "Independent AI commentary",
        body: BROADCAST_DISCLAIMER
      })
    };
  });
}

async function buildCards(): Promise<Card[]> {
  const [
    { filterBroadcastReadySegments },
    {
      getConferenceCoverageSlotsFromDb,
      getMedicalConferencesFromDb,
      getNextBroadcastSegmentsFromDb,
      getPendingSegmentsFromDb,
      getSocialVoiceLeaderboardFromDb
    },
    { buildScheduleRundownSegments },
    { buildHourlySocialVoiceRundownSegments },
    { buildBroadcastSlots }
  ] = await Promise.all([
    import("@/lib/data"),
    import("@/lib/db"),
    import("@/lib/jobs/upcomingEvents"),
    import("@/lib/social/hourlyVoiceRundown"),
    import("@/lib/rundown/slots")
  ]);
  const baseTime = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const hours = Math.max(1, Math.ceil(durationSeconds / 3600));
  const [approved, pending, leaderboard, coverageSlots, conferences] = await Promise.all([
    getNextBroadcastSegmentsFromDb(200),
    getPendingSegmentsFromDb(200),
    getSocialVoiceLeaderboardFromDb(),
    getConferenceCoverageSlotsFromDb(),
    getMedicalConferencesFromDb()
  ]);
  const activeCoverage = (coverageSlots ?? []).find((slot) => {
    const startsAt = new Date(slot.startsAt).getTime();
    const endsAt = startsAt + slot.durationHours * 3600 * 1000;
    return baseTime.getTime() >= startsAt && baseTime.getTime() < endsAt;
  });
  const activeConference = activeCoverage
    ? (conferences ?? []).find((conference) => conference.id === activeCoverage.conferenceId)
    : undefined;
  const conferenceOpening: Segment[] = activeConference
    ? [{
        id: `conference-opening-${activeConference.id}-${baseTime.toISOString()}`,
        title: `${activeConference.acronym ?? activeConference.name} coverage desk`,
        summary: `ConferenceHype coverage is focused on ${activeConference.name}.`,
        script: `ConferenceHype is now covering ${activeConference.name}. This block follows source-attributed updates across ${activeConference.specialties.join(", ")}. Check the official conference program for schedule and location changes.`,
        contentType: "agenda_preview",
        personaId: "echo-sage",
        personaName: "Echo Sage",
        hypeLevel: "standard",
        language: "English",
        status: "approved",
        citations: [{
          label: `${activeConference.name} official site`,
          url: activeConference.officialUrl,
          sourceType: "official"
        }],
        socialBuzzItems: [],
        riskFlags: ["conference_coverage_opening", `conference:${activeConference.id}`],
        confidenceScore: 100,
        createdAt: baseTime.toISOString(),
        approvedAt: baseTime.toISOString()
      }]
    : [];
  const slots = buildBroadcastSlots({
    segments: filterBroadcastReadySegments([...conferenceOpening, ...(approved ?? [])]),
    reviewSegments: filterBroadcastReadySegments(pending ?? []),
    scheduleSegments: buildScheduleRundownSegments(baseTime),
    socialVoiceSegments: buildHourlySocialVoiceRundownSegments({
      leaders: leaderboard ?? [],
      baseTime
    }),
    baseTime,
    hours
  }).filter((slot) => slot.at < new Date(baseTime.getTime() + durationSeconds * 1000));

  // Rule 7: gap-clip rotation — 4 approved 20-second techno stingers in public/music/gap-clips/
  const gapClipPaths = [
    "public/music/gap-clips/conferencehype-gap-elevate-to-fenrir-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-nightclub-to-rebecca-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-subterranean-to-adam-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-skyline-to-aussieonc-20s.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v1.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v2.mp3"
  ];
  let musicIndex = 0;
  return slots.map((slot) => {
    const isMusic = slot.kind === "music";
    return {
      duration: slot.durationSeconds,
      isMusic,
      gapClipPath: isMusic ? gapClipPaths[musicIndex++ % gapClipPaths.length] : undefined,
      personaId: !isMusic ? (slot.segment?.personaId ?? "echo-sage") : undefined,
      personaName: !isMusic ? slot.segment?.personaName : undefined,
      contentType: !isMusic ? slot.segment?.contentType : undefined,
      title: slot.segment?.title ?? slot.label,
      sourceLabel: !isMusic ? slot.segment?.citations[0]?.label : undefined,
      sourceUrl: !isMusic ? slot.segment?.citations[0]?.url : undefined,
      script: !isMusic ? (slot.segment?.summary || slot.segment?.script || null) : null,
      text: isMusic
        ? formatTransitionCard()
        : formatCard({
            eyebrow: `${slot.segment?.personaName ?? "ConferenceHype"} / ${slot.segment?.contentType.replace(/_/g, " ") ?? "content"}`,
            title: slot.segment?.title ?? slot.label,
            body: slot.segment?.summary || slot.segment?.script || slot.label,
            source: slot.segment?.citations[0]?.url
          })
    };
  });
}

// ---------------------------------------------------------------------------
// Block-mode card builder — three 20-minute blocks per hour:
//   Block 1: 2 min schedule  +  2 min hype music  +  16 min Conference News
//   Block 2: 2 min schedule  +  2 min hype music  +  16 min Social Desk (duo)
//   Block 3: 2 min schedule  +  2 min hype music  +  16 min Pharma News
//
// Each "pair" = 40 s content card  +  20 s gap-clip music card  = 60 s.
// 20 pairs × 60 s = 20 min per block; 3 blocks = 60 min = 1 h.
// ---------------------------------------------------------------------------
async function buildBlockCards(): Promise<Card[]> {
  const [
    { generateNewsBlockChunks, generateSocialBlockChunks, generatePharmaNewsBlockChunks },
    { getRecentMediaItemsFromDb, getRecentSocialItemsFromDb },
    { buildScheduleFallbackSegment }
  ] = await Promise.all([
    import("@/lib/jobs/generateBroadcastBlocks"),
    import("@/lib/db"),
    import("@/lib/jobs/upcomingEvents")
  ]);

  const baseTime = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const hours = Math.max(1, Math.ceil(durationSeconds / 3600));

  // Fetch source material once; failures are non-fatal
  const [mediaItems, socialItems] = await Promise.all([
    getRecentMediaItemsFromDb(1).catch(() => null),
    getRecentSocialItemsFromDb(1).catch(() => null)
  ]);

  console.log(
    JSON.stringify({
      mode: "blocks",
      hours,
      baseTime: baseTime.toISOString(),
      mediaItems: mediaItems?.length ?? 0,
      socialItems: socialItems?.length ?? 0
    })
  );

  // Generate all LLM content in parallel (3 calls per hour, all hours at once)
  const hourGenerations = await Promise.all(
    Array.from({ length: hours }, (_, hourIndex) => {
      const blockBase = new Date(baseTime.getTime() + hourIndex * 3600 * 1000);
      return Promise.allSettled([
        generateNewsBlockChunks(mediaItems ?? [], hourIndex, blockBase),
        generateSocialBlockChunks(socialItems ?? [], hourIndex, blockBase),
        generatePharmaNewsBlockChunks(mediaItems ?? [], hourIndex, blockBase)
      ]);
    })
  );

  // Timing constants
  const CONTENT_SECONDS = 40;
  const MUSIC_SECONDS = 20;
  const BLOCK_SCHEDULE_PAIRS = 2;  // 2 × 60 s = 2 min schedule
  const BLOCK_HYPE_PAIRS = 2;      // 2 × 60 s = 2 min hype music
  const BLOCK_CONTENT_PAIRS = 16;  // 16 × 60 s = 16 min content
  const BLOCKS_PER_HOUR = 3;
  const BLOCK_LABELS = ["Conference News", "Social Desk", "Pharma News"] as const;

  const gapClipPaths = [
    "public/music/gap-clips/conferencehype-gap-elevate-to-fenrir-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-nightclub-to-rebecca-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-subterranean-to-adam-20s.mp3",
    "public/music/gap-clips/conferencehype-gap-skyline-to-aussieonc-20s.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v1.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v2.mp3"
  ];
  let musicIndex = 0;

  const cards: Card[] = [];

  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    const hourStart = new Date(baseTime.getTime() + hourIndex * 3600 * 1000);
    const [newsResult, socialResult, pharmaResult] = hourGenerations[hourIndex];

    const newsChunks = newsResult.status === "fulfilled" ? newsResult.value : [];
    const socialChunks = socialResult.status === "fulfilled" ? socialResult.value : [];
    const pharmaChunks = pharmaResult.status === "fulfilled" ? pharmaResult.value : [];

    if (newsResult.status === "rejected") {
      console.warn(`News block generation failed (hour ${hourIndex}): ${newsResult.reason}`);
    }
    if (socialResult.status === "rejected") {
      console.warn(`Social block generation failed (hour ${hourIndex}): ${socialResult.reason}`);
    }
    if (pharmaResult.status === "rejected") {
      console.warn(`Pharma news block generation failed (hour ${hourIndex}): ${pharmaResult.reason}`);
    }

    for (let blockIndex = 0; blockIndex < BLOCKS_PER_HOUR; blockIndex++) {
      const blockLabel = BLOCK_LABELS[blockIndex];
      const blockOffsetMs =
        hourIndex * 3600 * 1000 + blockIndex * 20 * 60 * 1000;
      let slotMs = blockOffsetMs;

      const contentChunks =
        blockIndex === 0 ? newsChunks
        : blockIndex === 1 ? socialChunks
        : pharmaChunks;

      // ── Phase 1: Schedule (BLOCK_SCHEDULE_PAIRS pairs) ──────────────────
      for (let p = 0; p < BLOCK_SCHEDULE_PAIRS; p++) {
        const slotTime = new Date(baseTime.getTime() + slotMs);
        const seg = buildScheduleFallbackSegment(slotTime);
        const script = formatVoiceSegment({
          voiceName: seg.personaName,
          topic: seg.title,
          narrative: seg.script || seg.summary,
          at: slotTime
        });
        cards.push({
          duration: CONTENT_SECONDS,
          isMusic: false,
          personaId: seg.personaId,
          script,
          text: formatCard({
            eyebrow: `Schedule — ${seg.personaName}`,
            title: seg.title,
            body: script
          })
        });
        cards.push({
          duration: MUSIC_SECONDS,
          isMusic: true,
          gapClipPath: gapClipPaths[musicIndex++ % gapClipPaths.length],
          text: formatTransitionCard()
        });
        slotMs += (CONTENT_SECONDS + MUSIC_SECONDS) * 1000;
      }

      // ── Phase 2: Hype Music (BLOCK_HYPE_PAIRS pairs — no TTS) ──────────
      for (let p = 0; p < BLOCK_HYPE_PAIRS; p++) {
        cards.push({
          duration: CONTENT_SECONDS,
          isMusic: false,
          personaId: undefined,
          script: null, // No TTS — music bed + gap clip play under silent slide
          text: formatCard({
            eyebrow: "CONFERENCEHYPE",
            title: blockLabel,
            body: "Live conference commentary continues shortly."
          })
        });
        cards.push({
          duration: MUSIC_SECONDS,
          isMusic: true,
          gapClipPath: gapClipPaths[musicIndex++ % gapClipPaths.length],
          text: formatTransitionCard()
        });
        slotMs += (CONTENT_SECONDS + MUSIC_SECONDS) * 1000;
      }

      // ── Phase 3: 16-minute Content Block ────────────────────────────────
      for (let p = 0; p < BLOCK_CONTENT_PAIRS; p++) {
        const chunk = contentChunks[p];
        if (!chunk) {
          // Fallback: short schedule bridge
          const slotTime = new Date(baseTime.getTime() + slotMs);
          const seg = buildScheduleFallbackSegment(slotTime);
          const script = formatVoiceSegment({
            voiceName: seg.personaName,
            topic: seg.title,
            narrative: seg.script || seg.summary,
            at: slotTime
          });
          cards.push({
            duration: CONTENT_SECONDS,
            isMusic: false,
            personaId: seg.personaId,
            script,
            text: formatCard({
              eyebrow: `${blockLabel} — bridge`,
              title: seg.title,
              body: script
            })
          });
        } else {
          const slotTime = new Date(baseTime.getTime() + slotMs);
          const script = formatVoiceSegment({
            voiceName: chunk.personaName,
            topic: chunk.title,
            narrative: chunk.script,
            at: slotTime
          });
          cards.push({
            duration: CONTENT_SECONDS,
            isMusic: false,
            personaId: chunk.personaId,
            script,
            text: formatCard({
              eyebrow: `${blockLabel} — ${chunk.personaName}`,
              title: chunk.title,
              body: script
            })
          });
        }
        cards.push({
          duration: MUSIC_SECONDS,
          isMusic: true,
          gapClipPath: gapClipPaths[musicIndex++ % gapClipPaths.length],
          text: formatTransitionCard()
        });
        slotMs += (CONTENT_SECONDS + MUSIC_SECONDS) * 1000;
      }
    }
  }

  // Trim to durationSeconds just in case of rounding
  let accumulated = 0;
  return cards.filter((card) => {
    if (accumulated >= durationSeconds) return false;
    accumulated += card.duration;
    return true;
  });
}

function cardTitle(card: Card) {
  const nonemptyLines = card.text.split("\n").filter((line) => line.trim());
  return card.title ?? nonemptyLines[1] ?? nonemptyLines[0] ?? "Broadcast card";
}

function buildWriteoutCards(cards: Card[], startsAt: Date): BroadcastWriteoutCard[] {
  let elapsedSeconds = 0;
  return cards.map((card, index) => {
    const cardStartsAt = new Date(startsAt.getTime() + elapsedSeconds * 1000);
    elapsedSeconds += card.duration;
    return {
      position: index + 1,
      startsAt: cardStartsAt.toISOString(),
      durationSeconds: card.duration,
      kind: card.isMusic ? "music" : "content",
      title: cardTitle(card),
      personaName: card.personaName,
      contentType: card.contentType,
      script: card.script ?? undefined,
      sourceLabel: card.sourceLabel,
      sourceUrl: card.sourceUrl
    };
  });
}

function buildWriteoutMarkdown(title: string, cards: BroadcastWriteoutCard[]) {
  const lines = [`# ${title}`, ""];
  for (const card of cards) {
    if (card.kind === "music") {
      continue;
    }
    lines.push(`## ${card.position}. ${card.title}`);
    lines.push(`Start: ${card.startsAt}`);
    if (card.personaName) lines.push(`Voice: ${card.personaName}`);
    if (card.contentType) lines.push(`Type: ${card.contentType.replace(/_/g, " ")}`);
    lines.push("", card.script?.trim() || "No spoken script.", "");
    if (card.sourceUrl) {
      lines.push(`Source: ${card.sourceLabel ?? card.sourceUrl} (${card.sourceUrl})`, "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

async function saveBroadcastWriteout(cards: Card[]) {
  const { upsertBroadcastWriteoutInDb } = await import("@/lib/db");
  const startsAt = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const title =
    process.env.BROADCAST_TITLE ??
    `ConferenceHype programming - ${startsAt.toISOString()}`;
  const writeoutCards = buildWriteoutCards(cards, startsAt);
  await upsertBroadcastWriteoutInDb({
    coverageSlotId: process.env.COVERAGE_SLOT_ID || undefined,
    startsAt: startsAt.toISOString(),
    durationMinutes: 60,
    title,
    status: "rendering",
    youtubeVideoId: process.env.YOUTUBE_VIDEO_ID || undefined,
    youtubeUrl: process.env.YOUTUBE_VIDEO_URL || undefined,
    workflowRunId: process.env.GITHUB_RUN_ID || undefined,
    workflowUrl:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
    cards: writeoutCards,
    writeoutMarkdown: buildWriteoutMarkdown(title, writeoutCards)
  });
}

async function main() {
  const ffmpeg = process.env.FFMPEG_PATH ?? ffmpegPath ?? "ffmpeg";
  const useBlockMode = process.env.HOUR_BROADCAST_MODE === "blocks";
  const cards = applyPresentationPolicy(
    useBlockMode ? await buildBlockCards() : await buildCards()
  );
  await saveBroadcastWriteout(cards);
  await mkdir(renderDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const concatLines: string[] = [];

  for (let index = 0; index < cards.length; index += 1) {
    const slidePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.txt`);
    const imagePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
    await writeFile(slidePath, cards[index].text, "utf8");
    const color = index % 2 === 0 ? "0x11151f" : "0x151a27";
    const textPath = slidePath.replace(/\\/g, "/");
    const imageFilter =
      `drawbox=x=0:y=0:w=1280:h=18:color=0xf4483a@1:t=fill,` +
        `drawbox=x=0:y=702:w=1280:h=18:color=0x33d6c5@1:t=fill,` +
        `drawtext=font='Arial':textfile='${textPath}':x=70:y=72:fontsize=31:` +
        `fontcolor=white:line_spacing=13`;
    await run(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1280x720`,
      "-vf",
      imageFilter,
      "-frames:v",
      "1",
      imagePath
    ]);
    const concatPath = path.resolve(imagePath).replace(/\\/g, "/");
    concatLines.push(`file '${concatPath}'`, `duration ${cards[index].duration}`);
  }
  const lastImage = path
    .resolve(renderDir, `slide-${String(cards.length).padStart(2, "0")}.png`)
    .replace(/\\/g, "/");
  concatLines.push(`file '${lastImage}'`);
  const concatPath = path.join(renderDir, "slides.ffconcat");
  await writeFile(concatPath, concatLines.join("\n"), "utf8");

  // Per-card Kokoro TTS with file caching — batch synthesis (model loaded once)
  const voiceCacheDir = path.join(renderDir, "voice-cache");
  const voiceWavDir = path.join(voiceCacheDir, "wav-tmp");
  await mkdir(voiceCacheDir, { recursive: true });
  await mkdir(voiceWavDir, { recursive: true });
  const { applySpokenPronunciations } = await import("@/lib/media/tts");
  const { getPersona } = await import("@/lib/generation/personas");

  type VoiceEntry = { path: string; startMs: number; durationMs: number };
  type GapEntry = { path: string; startMs: number };
  const voiceEntries: VoiceEntry[] = [];
  const gapEntries: GapEntry[] = [];    // gap-clip stingers, one per music card
  let offsetMs = 0;

  // Resolve every card to its cache path and collect the ones that need synthesis
  type SynthTask = {
    voice: string;
    text: string;
    wavPath: string;
    cachePath: string;
    startMs: number;
    durationMs: number;
  };
  const tasks: SynthTask[] = [];
  const alreadyCached: Array<{ cachePath: string; startMs: number; durationMs: number }> = [];

  for (const card of cards) {
    // Rule 7: collect gap-clip start times for music cards
    if (card.isMusic && card.gapClipPath) {
      const resolvedGap = path.resolve(card.gapClipPath);
      if (existsSync(resolvedGap)) {
        gapEntries.push({ path: resolvedGap, startMs: offsetMs });
      }
    }

    if (!card.isMusic && card.script && card.personaId) {
      const persona = getPersona(card.personaId);
      const voiceName = process.env[persona.voiceEnvKey];
      if (voiceName) {
        const processedScript = applySpokenPronunciations(card.script);
        const cacheKey = createHash("sha256")
          .update(`${persona.voiceEnvKey}|${processedScript}`)
          .digest("hex");
        const cachePath = path.join(voiceCacheDir, `${cacheKey}.mp3`);
        if (existsSync(cachePath)) {
          alreadyCached.push({ cachePath, startMs: offsetMs, durationMs: card.duration * 1000 });
        } else {
          const wavPath = path.join(voiceWavDir, `${cacheKey}.wav`);
          tasks.push({
            voice: voiceName,
            text: processedScript,
            wavPath,
            cachePath,
            startMs: offsetMs,
            durationMs: card.duration * 1000
          });
        }
      }
    }
    offsetMs += card.duration * 1000;
  }

  // Add already-cached entries first (preserving time order below)
  for (const entry of alreadyCached) {
    voiceEntries.push({
      path: entry.cachePath,
      startMs: entry.startMs,
      durationMs: entry.durationMs
    });
  }

  // Synthesize all uncached cards in one Python call — loads KPipeline once
  if (tasks.length > 0) {
    const batchJsonPath = path.join(renderDir, "voice-batch.json");
    await writeFile(
      batchJsonPath,
      JSON.stringify(tasks.map((t) => ({ voice: t.voice, text: t.text, output: t.wavPath }))),
      "utf8"
    );

    const pyScript = path.resolve("scripts/generate-kokoro-dj-voice.py");
    // KOKORO_PYTHON_CMD overrides auto-detection (e.g. "python3" on Linux, "py -3.12" on Windows)
    const rawPyCmd = process.env.KOKORO_PYTHON_CMD;
    const [pyCmd, ...pyPrefix] = rawPyCmd
      ? rawPyCmd.split(/\s+/)
      : process.platform === "win32"
        ? ["py", "-3.12"]
        : ["python3"];

    try {
      console.log(`Synthesizing ${tasks.length} uncached voice card(s) via Kokoro batch...`);
      await run(pyCmd, [...pyPrefix, pyScript, "--mode", "batch", "--batch-file", batchJsonPath]);

      // Convert each WAV to MP3 and add to cache + voice entries
      for (const task of tasks) {
        if (existsSync(task.wavPath)) {
          try {
            await run(ffmpeg, ["-y", "-i", task.wavPath, "-c:a", "libmp3lame", "-b:a", "128k", task.cachePath]);
            voiceEntries.push({
              path: task.cachePath,
              startMs: task.startMs,
              durationMs: task.durationMs
            });
          } catch (convErr) {
            console.warn(`MP3 conversion failed for ${path.basename(task.wavPath)}: ${convErr}`);
          } finally {
            await rm(task.wavPath, { force: true }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`Kokoro batch TTS failed — broadcast will be music-only: ${err}`);
    } finally {
      await rm(batchJsonPath, { force: true }).catch(() => {});
    }
  }

  // Sort voice entries by start time so adelay values are ordered
  voiceEntries.sort((a, b) => a.startMs - b.startMs);

  const hasVoice = Boolean(voicePath) || voiceEntries.length > 0;

  let audioArgs: string[];
  if (voiceEntries.length > 0 || gapEntries.length > 0) {
    // Kokoro per-card voices + gap-clip stingers, all delayed to their slot start,
    // mixed over a quiet continuous music bed.
    // Rule 9: music bed raised to 0.25 so it's audible between voice cards.
    const voiceInputArgs = voiceEntries.flatMap((e) => ["-i", e.path]);
    const gapInputArgs = gapEntries.flatMap((e) => ["-i", e.path]);
    const filterParts: string[] = [`[1:a]volume=0.25[bed]`];
    voiceEntries.forEach((e, i) => {
      const durationSeconds = Math.max(0.1, e.durationMs / 1000);
      filterParts.push(
        `[${i + 2}:a]volume=0.85,atrim=0:${durationSeconds.toFixed(
          3
        )},asetpts=PTS-STARTPTS,adelay=${e.startMs}|${e.startMs}[v${i}]`
      );
    });
    const gapOffset = voiceEntries.length + 2;
    // Gap clips at 0.70 — prominent, above the bed but below the speaker voice
    gapEntries.forEach((e, i) => {
      filterParts.push(
        `[${gapOffset + i}:a]volume=0.70,adelay=${e.startMs}|${e.startMs}[g${i}]`
      );
    });
    const allStreams = [
      "[bed]",
      ...voiceEntries.map((_, i) => `[v${i}]`),
      ...gapEntries.map((_, i) => `[g${i}]`)
    ].join("");
    const totalStreams = 1 + voiceEntries.length + gapEntries.length;
    filterParts.push(
      `${allStreams}amix=inputs=${totalStreams}:duration=first:normalize=0[a]`
    );
    audioArgs = [
      "-stream_loop", "-1", "-i", musicPath,
      ...voiceInputArgs,
      ...gapInputArgs,
      "-filter_complex", filterParts.join(";")
    ];
  } else if (voicePath) {
    audioArgs = [
      "-stream_loop", "-1", "-i", musicPath,
      "-stream_loop", "-1", "-i", voicePath,
      "-filter_complex",
      "[1:a]volume=0.25[music];[2:a]volume=0.85[voice];[music][voice]amix=inputs=2:duration=first:dropout_transition=0[a]"
    ];
  } else {
    audioArgs = [
      "-stream_loop", "-1", "-i", musicPath,
      "-filter_complex", "[1:a]volume=0.28[a]"
    ];
  }

  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    ...audioArgs,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-r",
    "30",
    "-t",
    String(durationSeconds),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    outputPath
  ];

  console.log(
    JSON.stringify(
      {
        cards: cards.length,
        contentCards: cards.filter((card) => !card.isMusic).length,
        musicCards: cards.filter((card) => card.isMusic).length,
        voiceCardsCached: voiceEntries.length,
        durationSeconds,
        outputPath,
        musicPath,
        voicePath: voicePath ?? null
      },
      null,
      2
    )
  );
  await run(ffmpeg, args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
