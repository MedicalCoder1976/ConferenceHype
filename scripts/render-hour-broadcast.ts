import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import ffmpegPath from "ffmpeg-static";
import { cardTypeEyebrow, cardTypeLabel } from "@/lib/broadcast/cardTypes";
import { hasMissingIntakeFailureLanguage, sanitizeBroadcastCopy } from "@/lib/broadcast/sanitizeCopy";
import { HYPE_LINE_LOOP_PATH } from "@/lib/media/hypeLine";
import {
  formatVoiceSegment,
  stripBroadcastDisclaimer
} from "@/lib/broadcast/voiceSegment";
import { MUSIC_SECONDS } from "@/lib/broadcast/hourSchedule";
import { defaultDisclaimer } from "@/lib/generation/disclaimers";
import type { BroadcastWriteoutCard, ContentType, Persona, Segment } from "@/lib/types";

const durationSeconds = Math.min(Number(process.env.HOUR_BROADCAST_SECONDS ?? 3600), 3600);
const renderDir = process.env.HOUR_BROADCAST_DIR ?? "public/rendered/hour-broadcast";
const outputPath =
  process.env.HOUR_BROADCAST_OUTPUT ?? "public/rendered/conferencehype-hour-broadcast.mp4";
const musicPath =
  process.env.HOUR_BROADCAST_MUSIC ??
  "public/music/conferencehype-gap-music-6min-v6.mp3";
const voicePath = process.env.HOUR_BROADCAST_VOICE;

loadEnvConfig(process.cwd());

type Card = {
  duration: number;
  isMusic: boolean;
  gapClipPath?: string;
  segmentId?: string;
  personaId?: string;
  personaName?: string;
  contentType?: ContentType;
  title?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  script?: string | null;
  text: string;
  voiceAudioPath?: string;
  voiceDurationMs?: number;
  riskFlags?: string[];
};

const DISCLAIMER_INTERVAL_SECONDS = 15 * 60;
const BROADCAST_DISCLAIMER =
  `${defaultDisclaimer} ConferenceHype is independent and is not affiliated with conference organizers, presenters, sponsors, or exhibitors.`;
const GAP_CLIP_PATHS = [
  "public/music/gap-clips/conferencehype-gap-elevate-to-fenrir-20s.mp3",
  "public/music/gap-clips/conferencehype-gap-nightclub-to-rebecca-20s.mp3",
  "public/music/gap-clips/conferencehype-gap-subterranean-to-adam-20s.mp3",
  "public/music/gap-clips/conferencehype-gap-skyline-to-aussieonc-20s.mp3",
  "public/music/conferencehype-gap-music-20sec-preview-v4.mp3",
  "public/music/conferencehype-gap-music-20sec-preview-v4.mp3"
];

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
  return sanitizeBroadcastCopy(value)
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

function cardHasMissingIntakeFailure(card: Card) {
  return hasMissingIntakeFailureLanguage(
    [card.title, card.sourceLabel, card.sourceUrl, card.script, card.text]
      .filter(Boolean)
      .join(" ")
  );
}

function replaceMissingIntakeCardsWithMusic(cards: Card[]) {
  let musicIndex = 0;
  return cards.map((card) => {
    if (card.isMusic || !cardHasMissingIntakeFailure(card)) {
      if (card.isMusic) {
        musicIndex += 1;
      }
      return card;
    }
    return {
      duration: Math.max(20, card.duration),
      isMusic: true,
      gapClipPath: GAP_CLIP_PATHS[musicIndex++ % GAP_CLIP_PATHS.length],
      title: "Music transition",
      script: null,
      text: formatTransitionCard()
    };
  });
}

function replaceEmptyContentCardsWithMusic(cards: Card[]) {
  let musicIndex = 0;
  return cards.map((card) => {
    if (card.isMusic) {
      musicIndex += 1;
      return card;
    }
    if (card.script?.trim()) {
      return card;
    }
    return {
      duration: Math.max(20, card.duration),
      isMusic: true,
      gapClipPath: GAP_CLIP_PATHS[musicIndex++ % GAP_CLIP_PATHS.length],
      title: "Music transition",
      script: null,
      text: formatTransitionCard()
    };
  });
}
function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// Identifies a segment's real underlying content, independent of its
// database row id. Found on 2026-07-08: an old ingestion run left 5
// separate approved segment rows all citing the exact same tweet with
// byte-identical script text ("X voice monitor: ... STAT ... $8 billion in
// Medicaid funds..."), and the round-robin/bonus-fill fallback pools only
// ever deduped by segment id, so multiple of those rows could -- and did --
// get selected into the same broadcast hour, playing the same card 2-3
// times. Prefer the citation URL (the strongest signal of "same source
// item"); fall back to normalized script text for segments with no
// citation (e.g. synthetic/schedule cards).
function contentSignature(segment: Segment) {
  const url = segment.citations[0]?.url?.trim().toLowerCase();
  if (url) {
    return `url:${url}`;
  }
  return `script:${segment.script.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

// A card's real spoken length rarely matches its nominal scheduled duration
// exactly. Longer-than-scheduled segments (the common case for a genuine
// ~6-minute high-energy-host read) simply expand -- enforceOneHourFrame
// trims trailing cards later if that pushes the hour over. Shorter ones
// (an honest "nothing new to report" card, for example) must NOT sit in
// dead silence for the rest of their nominal slot: the leftover time flows
// into the music card that follows instead, so the broadcast is always
// either talking or playing music, never silent.
function expandContentDurations(cards: Card[]) {
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card.isMusic || !card.script) {
      continue;
    }
    const spokenSeconds = Math.ceil(wordCount(card.script) / 2) + 5;
    const nominal = card.duration;
    card.duration = spokenSeconds;
    const slack = nominal - spokenSeconds;
    const nextCard = cards[index + 1];
    if (slack > 0 && nextCard?.isMusic) {
      nextCard.duration += slack;
    }
  }
  return cards;
}

function totalCardSeconds(cards: Card[]) {
  return cards.reduce((total, card) => total + card.duration, 0);
}

function nextGapClipPath(index: number) {
  return GAP_CLIP_PATHS[index % GAP_CLIP_PATHS.length];
}

function musicTransitionCard(duration: number, musicIndex: number): Card {
  return {
    duration,
    isMusic: true,
    gapClipPath: nextGapClipPath(musicIndex),
    title: "Music transition",
    script: null,
    text: formatTransitionCard()
  };
}

// How far a music-only gap is allowed to stretch beyond a normal transition
// before the leftover time gets redirected into a bonus content card instead.
const MUSIC_GAP_CAP_SECONDS = 30;
// Safety bound against a pathologically short card chaining an unbounded
// number of inserts into a single gap.
const MAX_BONUS_CARDS_PER_GAP = 2;

function isUsableBonusCandidate(segment: Segment) {
  const raw = segment.script || segment.summary || "";
  if (!raw.trim()) {
    return false;
  }
  return !hasMissingIntakeFailureLanguage(`${segment.title} ${raw}`);
}

// Real spoken card length routinely undershoots the nominal 135s slot (often
// 45-90s), and expandContentDurations above dumps ALL of that leftover into
// the single following music card -- compounding across an hour into long
// music-only stretches. Cap each individual gap at MUSIC_SECONDS + a small
// fixed amount and use whatever's reclaimed to insert real, already-approved
// content instead, falling back to a longer (but still capped) music
// stretch only once the leftover-candidate pool for this hour runs dry.
// unusedApproved is the exact same already-vetted pool buildBroadcastSlots'
// internal round-robin fallback draws from -- just the portion of it none of
// the official 20 slots happened to consume. Consumed here in place so a
// later gap in the same hour never reuses a candidate an earlier gap spent,
// and a candidate that fails validation is discarded (not retried) so a
// single bad candidate can never permanently block every later gap.
async function fillLeftoverGapsWithBonusCards(
  cards: Card[],
  unusedApproved: Segment[],
  applySpokenPronunciations: (script: string) => string,
  getPersona: (personaId: string) => Persona
): Promise<Card[]> {
  const { withAssignedVoice } = await import("@/lib/rundown/slots");
  const pool = [...unusedApproved];
  const result: Card[] = [];
  let musicIndex = 0;

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    result.push(card);

    if (card.isMusic) {
      musicIndex += 1;
      continue;
    }

    const musicCard = cards[index + 1];
    if (!musicCard?.isMusic) {
      continue;
    }

    // Consume the music card here (skip the loop's natural next iteration
    // for it below) so we control exactly what gets inserted after it.
    index += 1;
    const cap = MUSIC_SECONDS + MUSIC_GAP_CAP_SECONDS;
    // Bonus pairs draw from the FULL original gap, not from a pre-capped
    // surplus above the cap -- a real bonus card + its own transition
    // (typically 90-135s) is usually comparable in size to the whole gap
    // being replaced, so reserving the cap up front left too little room
    // for even one bonus pair to ever fit. Insert as many pairs as the gap
    // can afford; whatever's left afterward (including a whole gap that
    // couldn't fit even one pair) gets hard-capped -- any amount trimmed
    // off here isn't lost, it flows into enforceOneHourFrame's existing
    // end-of-hour padding, same as it already does for any other shortfall.
    let remaining = musicCard.duration;
    result.push(musicCard);
    musicIndex += 1;

    let bonusCount = 0;
    while (remaining > cap && pool.length > 0 && bonusCount < MAX_BONUS_CARDS_PER_GAP) {
      const candidate = pool[0];
      if (!isUsableBonusCandidate(candidate)) {
        pool.shift();
        continue;
      }
      const persona = card.personaId ? getPersona(card.personaId) : undefined;
      if (!persona) {
        break;
      }
      const voiced = withAssignedVoice(candidate, persona, undefined, false, new Date());
      const processedScript = applySpokenPronunciations(voiced.script);
      if (!processedScript.trim()) {
        pool.shift();
        continue;
      }
      const bonusDuration = Math.ceil(wordCount(voiced.script) / 2) + 5;
      const totalCost = bonusDuration + MUSIC_SECONDS;
      if (totalCost > remaining) {
        break;
      }

      pool.shift();
      result.push({
        duration: bonusDuration,
        isMusic: false,
        segmentId: voiced.id,
        personaId: voiced.personaId,
        personaName: voiced.personaName,
        contentType: voiced.contentType,
        title: voiced.title,
        sourceLabel: voiced.citations[0]?.label,
        sourceUrl: voiced.citations[0]?.url,
        script: voiced.script,
        riskFlags: voiced.riskFlags,
        text: formatCard({
          eyebrow: `${voiced.personaName ?? "ConferenceHype"} / ${cardTypeEyebrow(voiced)}`,
          title: voiced.title,
          body: voiced.script,
          source: voiced.citations[0]?.url
        })
      });
      result.push(musicTransitionCard(MUSIC_SECONDS, musicIndex));
      musicIndex += 1;

      remaining -= totalCost;
      bonusCount += 1;
    }

    musicCard.duration = Math.min(remaining, cap);
  }

  return result;
}

function enforceOneHourFrame(cards: Card[], frameSeconds = 3600) {
  const framedCards = [...cards];
  let removedContentCards = 0;

  while (totalCardSeconds(framedCards) > frameSeconds) {
    const lastContentIndex = framedCards.map((card) => !card.isMusic).lastIndexOf(true);
    if (lastContentIndex === -1) {
      break;
    }

    let deleteCount = 1;
    for (let index = lastContentIndex + 1; index < framedCards.length; index += 1) {
      if (!framedCards[index].isMusic) {
        break;
      }
      deleteCount += 1;
    }
    framedCards.splice(lastContentIndex, deleteCount);
    removedContentCards += 1;
  }

  while (totalCardSeconds(framedCards) > frameSeconds && framedCards.length > 0) {
    const lastCard = framedCards[framedCards.length - 1];
    const excessSeconds = totalCardSeconds(framedCards) - frameSeconds;
    if (lastCard.isMusic && lastCard.duration > excessSeconds) {
      lastCard.duration -= excessSeconds;
      break;
    }
    framedCards.pop();
  }

  const remainingSeconds = frameSeconds - totalCardSeconds(framedCards);
  if (remainingSeconds > 0) {
    const musicIndex = framedCards.filter((card) => card.isMusic).length;
    framedCards.push(musicTransitionCard(remainingSeconds, musicIndex));
  }

  if (removedContentCards > 0) {
    console.warn(
      `Removed ${removedContentCards} trailing content card(s) so the broadcast fits the 60-minute frame.`
    );
  }

  return framedCards;
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

async function buildCards(): Promise<{ cards: Card[]; unusedApproved: Segment[] }> {
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
  const coverageSlotId = process.env.COVERAGE_SLOT_ID;
  const approvedSegments = approved ?? [];
  const slotTaggedSegments = coverageSlotId
    ? approvedSegments.filter((segment) =>
        segment.riskFlags.includes(`coverage_slot:${coverageSlotId}`)
      )
    : [];
  const renderSegments = slotTaggedSegments.length ? slotTaggedSegments : approvedSegments;

  const slots = buildBroadcastSlots({
    segments: filterBroadcastReadySegments([...conferenceOpening, ...renderSegments]),
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
    "public/music/conferencehype-gap-music-20sec-preview-v4.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v4.mp3"
  ];
  let musicIndex = 0;
  const cards = slots.map((slot) => {
    const isMusic = slot.kind === "music";
    return {
      duration: slot.durationSeconds,
      isMusic,
      gapClipPath: isMusic ? gapClipPaths[musicIndex++ % gapClipPaths.length] : undefined,
      segmentId: !isMusic ? slot.segment?.id : undefined,
      personaId: !isMusic ? (slot.segment?.personaId ?? "echo-sage") : undefined,
      personaName: !isMusic ? slot.segment?.personaName : undefined,
      contentType: !isMusic ? slot.segment?.contentType : undefined,
      title: slot.segment?.title ?? slot.label,
      sourceLabel: !isMusic ? slot.segment?.citations[0]?.label : undefined,
      sourceUrl: !isMusic ? slot.segment?.citations[0]?.url : undefined,
      script: !isMusic ? (slot.segment?.script || slot.segment?.summary || null) : null,
      riskFlags: !isMusic ? (slot.segment?.riskFlags ?? []) : undefined,
      text: isMusic
        ? formatTransitionCard()
        : formatCard({
            eyebrow: `${slot.segment?.personaName ?? "ConferenceHype"} / ${slot.segment ? cardTypeEyebrow(slot.segment) : "CONTENT"}`,
            title: slot.segment?.title ?? slot.label,
            body: slot.segment?.script || slot.segment?.summary || slot.label,
            source: slot.segment?.citations[0]?.url
          })
    };
  });

  // Segments approved for this render but never assigned to any of the
  // official slots above (buildBroadcastSlots' internal round-robin fallback
  // only draws as many as it needs) -- this is the exact same already-vetted
  // pool, just the leftover portion of it. Used by fillLeftoverGapsWithBonusCards
  // to insert real content into gaps instead of stretching music.
  //
  // Dedupe by content signature, not just id: a duplicate-content segment
  // (different row, same underlying source item -- see contentSignature)
  // must never be picked as bonus filler if its content is already airing
  // this hour via an official slot, and if several unused candidates share
  // one signature, only the first is eligible -- the rest would just be the
  // same card again under a different id.
  const usedIds = new Set(
    slots.filter((slot) => slot.segment).map((slot) => slot.segment!.id)
  );
  const usedSignatures = new Set(
    slots.filter((slot) => slot.segment).map((slot) => contentSignature(slot.segment!))
  );
  const unusedApproved: Segment[] = [];
  for (const segment of renderSegments) {
    if (usedIds.has(segment.id)) {
      continue;
    }
    const signature = contentSignature(segment);
    if (usedSignatures.has(signature)) {
      continue;
    }
    usedSignatures.add(signature);
    unusedApproved.push(segment);
  }

  return { cards, unusedApproved };
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
    "public/music/conferencehype-gap-music-20sec-preview-v4.mp3",
    "public/music/conferencehype-gap-music-20sec-preview-v4.mp3"
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
          at: slotTime,
          cardIndex: cards.filter((card) => !card.isMusic).length
        });
        cards.push({
          duration: CONTENT_SECONDS,
          isMusic: false,
          personaId: seg.personaId,
          personaName: seg.personaName,
          contentType: "agenda_preview",
          title: seg.title,
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
          contentType: blockIndex === 2 ? "industry_floor" : "media_roundup",
          title: blockLabel,
          script: null, // No TTS — music bed + gap clip play under silent slide
          text: formatCard({
            eyebrow: cardTypeEyebrow({
              contentType: blockIndex === 2 ? "industry_floor" : "media_roundup",
              title: blockLabel
            }),
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
        if (!chunk?.script?.trim()) {
          cards.push({
            duration: CONTENT_SECONDS,
            isMusic: true,
            gapClipPath: gapClipPaths[musicIndex++ % gapClipPaths.length],
            title: "Music transition",
            script: null,
            text: formatTransitionCard()
          });
        } else {
          const slotTime = new Date(baseTime.getTime() + slotMs);
          const script = formatVoiceSegment({
            voiceName: chunk.personaName,
            topic: chunk.title,
            narrative: chunk.script,
            at: slotTime,
            cardIndex: cards.filter((card) => !card.isMusic).length
          });
          cards.push({
            duration: CONTENT_SECONDS,
            isMusic: false,
            personaId: chunk.personaId,
            personaName: chunk.personaName,
            contentType: blockIndex === 2 ? "industry_floor" : "media_roundup",
            title: chunk.title,
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

  return cards;
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
      sourceUrl: card.sourceUrl,
      riskFlags: card.riskFlags
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
    if (card.contentType) lines.push(`Type: ${cardTypeLabel(card)}`);
    lines.push("", sanitizeBroadcastCopy(card.script?.trim() || "No spoken script."), "");
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
  const { applySpokenPronunciations } = await import("@/lib/media/tts");
  const { getPersona } = await import("@/lib/generation/personas");
  const { cards: rawCards, unusedApproved } = useBlockMode
    ? { cards: await buildBlockCards(), unusedApproved: [] as Segment[] }
    : await buildCards();
  const cards = enforceOneHourFrame(
    await fillLeftoverGapsWithBonusCards(
      expandContentDurations(
        replaceEmptyContentCardsWithMusic(
          replaceMissingIntakeCardsWithMusic(applyPresentationPolicy(rawCards))
        )
      ),
      unusedApproved,
      applySpokenPronunciations,
      getPersona
    ),
    3600
  );

  // Opt-in, no-op-by-default escape hatch for sanity-checking the full card
  // pipeline (scheduling, duration expansion, bonus-gap-filling, hour
  // framing) against real data without running ffmpeg or writing anything.
  if (process.env.HOUR_BROADCAST_DRY_RUN === "1") {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          totalSeconds: totalCardSeconds(cards),
          contentCards: cards.filter((card) => !card.isMusic).length,
          musicCards: cards.filter((card) => card.isMusic).length,
          unusedApprovedAvailable: unusedApproved.length,
          cards: cards.map((card) => ({
            isMusic: card.isMusic,
            duration: card.duration,
            title: card.title,
            script: card.script ?? undefined
          }))
        },
        null,
        2
      )
    );
    return;
  }

  await saveBroadcastWriteout(cards);

  // Mark every real, DB-backed segment used in this hour's card list as
  // aired, so it stops being pulled into a future hour's approved-segment
  // pool (getNextBroadcastSegmentsFromDb only selects status="approved").
  // Synthetic, non-DB segment ids (the conference-opening card, schedule/
  // social fallback segments) simply don't match any row and are silently
  // skipped by the .eq("status","approved") guard inside the update.
  const usedSegmentIds = [
    ...new Set(
      cards
        .filter((card) => !card.isMusic && card.segmentId)
        .map((card) => card.segmentId!)
    )
  ];
  if (usedSegmentIds.length > 0) {
    const { markSegmentsRenderedInDb } = await import("@/lib/db");
    await markSegmentsRenderedInDb(usedSegmentIds).catch((error) => {
      console.warn(`Failed to mark segments as rendered — the broadcast still airs normally: ${error}`);
    });
  }

  // Rebuild title/description/tags from the cards actually used in this
  // render and push them over whatever scripts/create-youtube-broadcast.ts
  // set minutes earlier. That earlier step reads its own independent
  // snapshot of the approved-segment pool well before rendering finishes
  // selecting/framing/replacing cards, so it can end up describing
  // different content than what actually airs -- confirmed on a real
  // broadcast (2026-07-12, video WZU4hNgqjcw) where the description's
  // chapter list didn't match the narrated cards, every chapter was
  // missing its journal name/date, and the title fell back to the
  // coverage slot's linked conference ("ACC live programming") because
  // that earlier snapshot happened to land on backlog cards that predate
  // Citation.journalId. This block is the single source of truth for what
  // actually aired, so it can't drift the same way.
  if (process.env.YOUTUBE_VIDEO_ID && usedSegmentIds.length > 0) {
    try {
      const {
        getSegmentsByIdsFromDb,
        getOncologyJournalsFromDb,
        getConferenceCoverageSlotsFromDb,
        getMedicalConferencesFromDb
      } = await import("@/lib/db");
      const { buildBroadcastMetadata } = await import("@/lib/youtube/broadcastMetadata");
      const [usedSegments, journals, coverageSlots, conferences] = await Promise.all([
        getSegmentsByIdsFromDb(usedSegmentIds),
        getOncologyJournalsFromDb(),
        getConferenceCoverageSlotsFromDb(),
        getMedicalConferencesFromDb()
      ]);
      const segmentsById = new Map(usedSegments.map((segment) => [segment.id, segment]));
      const journalsById = new Map((journals ?? []).map((journal) => [journal.id, journal]));
      const activeSlot = (coverageSlots ?? []).find((slot) => slot.id === process.env.COVERAGE_SLOT_ID);
      const activeConference = activeSlot
        ? (conferences ?? []).find((conference) => conference.id === activeSlot.conferenceId)
        : undefined;
      const hourStart = process.env.HOUR_BROADCAST_START
        ? new Date(process.env.HOUR_BROADCAST_START)
        : new Date();
      let elapsedMs = 0;
      const slots = cards.map((card) => {
        const at = new Date(hourStart.getTime() + elapsedMs);
        elapsedMs += card.duration * 1000;
        return {
          at,
          kind: (card.isMusic ? "music" : "schedule") as "music" | "schedule",
          durationMinutes: card.duration / 60,
          durationSeconds: card.duration,
          segment: card.segmentId ? segmentsById.get(card.segmentId) : undefined,
          label: card.title ?? ""
        };
      });
      const actualMetadata = buildBroadcastMetadata({
        hourStart,
        conferenceName: activeConference?.acronym ?? activeConference?.name,
        slots,
        journalsById
      });

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "",
          client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
          refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN ?? "",
          grant_type: "refresh_token"
        })
      });
      if (!tokenResponse.ok) {
        throw new Error(`YouTube OAuth refresh failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
      }
      const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

      const updateResponse = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: process.env.YOUTUBE_VIDEO_ID,
          snippet: {
            title: actualMetadata.title,
            description: actualMetadata.description,
            tags: actualMetadata.tags,
            categoryId: actualMetadata.categoryId
          }
        })
      });
      if (!updateResponse.ok) {
        throw new Error(`videos.update failed: ${updateResponse.status} ${await updateResponse.text()}`);
      }
      console.log(`Updated YouTube title/description from ${cards.length} actual rendered cards (tier=${actualMetadata.tier}).`);
    } catch (error) {
      console.log(`::warning::Could not update YouTube metadata from actual rendered cards: ${String(error)}`);
    }
  }

  await mkdir(renderDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const concatLines: string[] = [];

  for (let index = 0; index < cards.length; index += 1) {
    const slidePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.txt`);
    const imagePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
    await writeFile(slidePath, cards[index].text, "utf8");
    const color = index % 2 === 0 ? "0x11151f" : "0x151a27";
    await run(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1280x720`,
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

  type VoiceEntry = { path: string; startMs: number; durationMs: number };
  type GapEntry = { path: string; startMs: number };
  type BedEntry = { startMs: number; durationMs: number };
  const voiceEntries: VoiceEntry[] = [];
  const gapEntries: GapEntry[] = [];    // gap-clip stingers, one per music card
  // Music-bed windows, one per music-kind card -- confined to that card's own
  // slot so the bed only ever plays during an actual gap, never under voice.
  const bedEntries: BedEntry[] = [];
  let offsetMs = 0;

  // Resolve every card to its cache path and collect the ones that need synthesis.
  // Multiple distinct card slots can share an identical cacheKey -- most
  // commonly the BROADCAST_DISCLAIMER card, which is the exact same text and
  // persona every time it's inserted (every ~15 minutes, so 2-3x per hour).
  // Those occurrences must be deduplicated for synthesis (no point asking
  // Kokoro to render identical audio 3 times) but each occurrence still needs
  // its OWN voiceEntry at its own startMs, since they land in different
  // slots of the broadcast.
  type SynthTask = { voice: string; text: string; wavPath: string; cachePath: string };
  type Occurrence = { cacheKey: string; cachePath: string; startMs: number; durationMs: number };
  const taskByCacheKey = new Map<string, SynthTask>();
  const pendingOccurrences: Occurrence[] = [];
  const alreadyCached: Occurrence[] = [];

  for (const card of cards) {
    // Rule 9: the music bed only plays inside a music-kind card's own slot,
    // never under voice -- previously it looped continuously for the whole
    // hour and got mixed under every voice card too, confirmed as a real
    // bug from a live operator report (background music audible "often",
    // not just between cards) rather than the intended gap-only sound.
    if (card.isMusic) {
      bedEntries.push({ startMs: offsetMs, durationMs: card.duration * 1000 });
    }
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
        // replaceEmptyContentCardsWithMusic already screened out cards whose
        // RAW script is empty, but applySpokenPronunciations (stripping URLs,
        // bracketed citations, and internal operator-language sentences) can
        // still reduce a genuinely non-empty script down to "" -- e.g. a card
        // whose entire content is a bare URL or a single internal-label
        // sentence like "Source-only schedule confirmed for this session."
        // Kokoro doesn't throw on empty text itself; it just returns zero
        // audio chunks, and concatenating zero chunks downstream is what
        // actually raised. Skip creating a synthesis task at all in that
        // case rather than handing Kokoro text with nothing to say.
        if (!processedScript.trim()) {
          console.warn(
            `Skipping voice synthesis for a card whose script became empty after pronunciation cleanup (persona ${persona.voiceEnvKey}).`
          );
        } else {
          const cacheKey = createHash("sha256")
            .update(`${persona.voiceEnvKey}|${processedScript}`)
            .digest("hex");
          const cachePath = path.join(voiceCacheDir, `${cacheKey}.mp3`);
          const durationMs = card.duration * 1000;
          if (existsSync(cachePath)) {
            alreadyCached.push({ cacheKey, cachePath, startMs: offsetMs, durationMs });
          } else {
            pendingOccurrences.push({ cacheKey, cachePath, startMs: offsetMs, durationMs });
            if (!taskByCacheKey.has(cacheKey)) {
              const wavPath = path.join(voiceWavDir, `${cacheKey}.wav`);
              taskByCacheKey.set(cacheKey, { voice: voiceName, text: processedScript, wavPath, cachePath });
            }
          }
        }
      }
    }
    offsetMs += card.duration * 1000;
  }

  const tasks = [...taskByCacheKey.values()];

  // Add already-cached entries first (preserving time order below) -- one
  // voiceEntry per occurrence, even when several slots share a cachePath.
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
    } catch (err) {
      // The batch script now skips individual failed cards and keeps going
      // (see synthesize_batch in generate-kokoro-dj-voice.py), so this only
      // fires on a genuine process-level crash. Even then, do NOT bail out of
      // the whole hour's narration here -- salvage whatever wav files were
      // already written before the crash instead of discarding them. This
      // used to catch-and-return here, which meant one bad card (or any
      // transient failure) silenced every already-synthesized card too and
      // fell back to a music-only broadcast for the entire hour.
      console.warn(`Kokoro batch TTS reported an error — salvaging any cards it did finish: ${err}`);
    }

    // Convert each unique WAV to MP3 exactly once. Runs regardless of
    // whether the batch call above succeeded, so a crash partway through
    // still keeps the narration for every card synthesized before it.
    for (const task of tasks) {
      if (existsSync(task.wavPath)) {
        try {
          await run(ffmpeg, ["-y", "-i", task.wavPath, "-c:a", "libmp3lame", "-b:a", "128k", task.cachePath]);
        } catch (convErr) {
          console.warn(`MP3 conversion failed for ${path.basename(task.wavPath)}: ${convErr}`);
        } finally {
          await rm(task.wavPath, { force: true }).catch(() => {});
        }
      }
    }
    await rm(batchJsonPath, { force: true }).catch(() => {});

    // Now fan each successfully-produced cachePath back out to every card
    // slot that needed it, not just the first. Previously this pushed a
    // voiceEntry inline in the loop above, keyed to one task per cachePath --
    // when 2+ card slots shared an identical cacheKey (most commonly the
    // BROADCAST_DISCLAIMER card, which repeats verbatim every ~15 minutes),
    // only the first slot got a voiceEntry; the wav was deleted right after
    // its conversion, so by the time the loop reached the next occurrence of
    // that same cacheKey it found nothing to convert and silently produced no
    // voiceEntry at all for that slot -- confirmed 2026-07-06 on a real
    // broadcast where 2 of 3 disclaimer repeats within the hour played music
    // with no narration. Every occurrence now gets its own voiceEntry at its
    // own startMs as long as the shared mp3 exists on disk.
    for (const occurrence of pendingOccurrences) {
      if (existsSync(occurrence.cachePath)) {
        voiceEntries.push({
          path: occurrence.cachePath,
          startMs: occurrence.startMs,
          durationMs: occurrence.durationMs
        });
      }
    }
  }

  // Sort voice entries by start time so adelay values are ordered
  voiceEntries.sort((a, b) => a.startMs - b.startMs);

  const hasVoice = Boolean(voicePath) || voiceEntries.length > 0;
  const renderedDurationSeconds = totalCardSeconds(cards);

  let audioArgs: string[];
  if (voiceEntries.length > 0 || gapEntries.length > 0) {
    // Kokoro per-card voices + gap-clip stingers, all delayed to their slot start,
    // mixed over a music bed confined to each music-kind card's own window.
    const voiceInputArgs = voiceEntries.flatMap((e) => ["-i", e.path]);
    const gapInputArgs = gapEntries.flatMap((e) => ["-i", e.path]);
    const filterParts: string[] = [];
    // Rule 9: the bed must only sound during an actual gap slot, never under
    // voice. It previously looped continuously for the whole hour and got
    // mixed into every voice card too -- a real operator-reported bug
    // ("hearing background music/noise often", not just between cards).
    // Referencing the single looped bed input [1:a] more than once directly
    // is invalid ffmpeg filter syntax, so asplit fans it out to one
    // independent copy per music-kind slot, each trimmed/delayed to just
    // that slot's own window.
    const bedStreamLabels = bedEntries.map((_, i) => `[bed${i}]`);
    if (bedEntries.length > 0) {
      const bedSplitLabels = bedEntries.map((_, i) => `[bedsrc${i}]`);
      filterParts.push(`[1:a]asplit=${bedEntries.length}${bedSplitLabels.join("")}`);
      bedEntries.forEach((e, i) => {
        const durationSeconds = Math.max(0.1, e.durationMs / 1000);
        filterParts.push(
          `[bedsrc${i}]atrim=0:${durationSeconds.toFixed(
            3
          )},asetpts=PTS-STARTPTS,adelay=${e.startMs}|${e.startMs},volume=0.25[bed${i}]`
        );
      });
    }
    voiceEntries.forEach((e, i) => {
      // card.duration (and so e.durationMs) is a word-count estimate of the
      // spoken length, not the real Kokoro output length. atrim is only here
      // to stop a voice track from bleeding into the next card's slot, not to
      // guarantee the estimate is exact — a +3s safety margin means a card
      // whose real narration runs slightly longer than estimated still gets
      // its last words heard instead of hard-cut mid-sentence.
      const durationSeconds = Math.max(0.1, e.durationMs / 1000) + 3;
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
      ...bedStreamLabels,
      ...voiceEntries.map((_, i) => `[v${i}]`),
      ...gapEntries.map((_, i) => `[g${i}]`)
    ].join("");
    const totalStreams = bedStreamLabels.length + voiceEntries.length + gapEntries.length;
    // Bug fixed 2026-07-12: this was "duration=first" from before the
    // per-gap bed fix, when the single [1:a] bed stream (looped for the
    // whole hour) was always first in allStreams and never naturally ended,
    // so "first" was effectively "as long as needed." Once the bed became
    // one short, finite-duration entry per music slot ([bed0], [bed1], ...)
    // -- still listed first in allStreams -- "duration=first" made the
    // WHOLE mixed output end the instant that first, short bed clip ended,
    // often just minutes into the hour: everything scheduled after that
    // point (the large majority of the hour's narration) went completely
    // silent even though ffmpeg reported success and the video rendered for
    // the full 3600s. Confirmed against a real broadcast (2026-07-12, video
    // Lh_PPcBQuU4) where only the first stretch of content was actually
    // audible. "longest" makes the mix run until the latest-ending stream
    // (always a card near the end of the hour) instead of the earliest one.
    filterParts.push(
      `${allStreams}amix=inputs=${totalStreams}:duration=longest:normalize=0[a]`
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

  // Bars loop is appended as the last input so it doesn't shift the numeric
  // audio input indices referenced inside audioArgs's filter_complex.
  const hypeLineLoopInputIndex = 1 + audioArgs.filter((arg) => arg === "-i").length;
  const hypeLineLoopInputArgs = ["-stream_loop", "-1", "-i", path.resolve(HYPE_LINE_LOOP_PATH)];
  audioArgs[audioArgs.length - 1] =
    `${audioArgs[audioArgs.length - 1]};[0:v][${hypeLineLoopInputIndex}:v]overlay=0:0[vout]`;

  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    ...audioArgs,
    ...hypeLineLoopInputArgs,
    "-map",
    "[vout]",
    "-map",
    "[a]",
    "-r",
    "30",
    "-t",
    String(renderedDurationSeconds),
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
        plannedDurationSeconds: durationSeconds,
        renderedDurationSeconds,
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
