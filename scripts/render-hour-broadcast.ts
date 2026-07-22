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
import { isOperatorMusicSegment, operatorMusicPath } from "@/lib/broadcast/operatorMusic";
import { broadcastDisclaimer } from "@/lib/generation/disclaimers";
import { JOURNAL_SHOW_SECONDS } from "@/lib/broadcast/journalShowSchedule";
import { contentSignature } from "@/lib/segments/contentSignature";
import type { BroadcastWriteoutCard, ContentType, Persona, Segment } from "@/lib/types";
import type { BroadcastSlot } from "@/lib/rundown/slots";

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
  riskFlags?: string[];
};

const DISCLAIMER_INTERVAL_SECONDS = 15 * 60;
const BROADCAST_DISCLAIMER = broadcastDisclaimer;
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

// No ffprobe binary is guaranteed to be on PATH (ffmpeg-static ships only
// ffmpeg locally; CI installs the apt "ffmpeg" package, which does bundle
// ffprobe, but nothing here should depend on that). Decoding with
// "-f null -" and reading the last "time=" progress line gives the real
// decoded length from the same ffmpeg binary already used everywhere else in
// this script, rather than trusting a container's "Duration:" header, which
// can be a bitrate-based estimate for some MP3 encoders.
function probeAudioDurationSeconds(ffmpeg: string, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-i", filePath, "-f", "null", "-"]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", () => {
      const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
      const last = matches[matches.length - 1];
      if (!last) {
        reject(new Error(`Could not determine audio duration for ${path.basename(filePath)}`));
        return;
      }
      const [, hh, mm, ss] = last;
      resolve(Number(hh) * 3600 + Number(mm) * 60 + Number(ss));
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

// disclaimerIntervalSeconds defaults to the hourly format's 15-minute
// cadence. The 30-minute journal show passes Infinity here -- it already
// inserts its own disclaimer cards structurally at slot-build time (see
// buildJournalShowSlots), so the time-based insertion below must never
// fire for it -- but the stray-disclaimer-text-stripping and
// music-transition-text-formatting side effects below still need to run on
// every other card, which is why this stays a shared function with a
// parameter rather than being skipped entirely for journal mode.
function applyPresentationPolicy(cards: Card[], disclaimerIntervalSeconds = DISCLAIMER_INTERVAL_SECONDS) {
  let elapsedSeconds = 0;
  let nextDisclaimerAt = disclaimerIntervalSeconds;

  return cards.map((card) => {
    const startsAt = elapsedSeconds;
    elapsedSeconds += card.duration;

    if (card.isMusic) {
      return {
        ...card,
        text: formatTransitionCard()
      };
    }

    // The journal show's own structural disclaimer cards (tagged
    // "journal_show_disclaimer") carry BROADCAST_DISCLAIMER as their
    // intentional content -- stripBroadcastDisclaimer exists to remove that
    // same text when it's leaked into a REAL content card, so it must not
    // run over these cards or it would blank them out.
    if (card.riskFlags?.includes("journal_show_disclaimer")) {
      return card;
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
      nextDisclaimerAt += disclaimerIntervalSeconds;
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

// Shared BroadcastSlot[] -> Card[] mapping, used by both the hourly format
// (buildCards) and the 30-minute single-journal format (buildJournalCards)
// -- identical BroadcastSlot shape, so this is a straight reuse, not a
// duplicate implementation per format.
function slotsToCards(slots: BroadcastSlot[]): Card[] {
  let musicIndex = 0;
  return slots.map((slot) => {
    const isMusic = slot.kind === "music";
    const placedMusicPath = isOperatorMusicSegment(slot.segment)
      ? operatorMusicPath(slot.segment)
      : undefined;
    return {
      duration: slot.durationSeconds,
      isMusic,
      gapClipPath: isMusic
        ? placedMusicPath
          ? `public${placedMusicPath}`
          : GAP_CLIP_PATHS[musicIndex++ % GAP_CLIP_PATHS.length]
        : undefined,
      segmentId: slot.segment?.id,
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

  const cards = slotsToCards(slots);

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

// 30-minute single-journal show. No conference-opening card, schedule
// segments, or social-voice fallback -- none of that applies to a
// single-journal show, and per the product spec, content-volume fallback
// (what to do if a journal doesn't have enough fresh content) is explicitly
// out of scope for this first cut.
async function buildJournalCards(): Promise<{ cards: Card[]; unusedApproved: Segment[] }> {
  const [{ filterBroadcastReadySegments }, { getNextBroadcastSegmentsFromDb }, { buildJournalShowSlots }] =
    await Promise.all([
      import("@/lib/data"),
      import("@/lib/db"),
      import("@/lib/rundown/slots")
    ]);
  const baseTime = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const journalId = process.env.JOURNAL_ID;
  if (!journalId) {
    throw new Error("JOURNAL_ID is required when HOUR_BROADCAST_MODE=journal30");
  }
  const approved = await getNextBroadcastSegmentsFromDb(200);
  const renderSegments = filterBroadcastReadySegments(approved ?? []);

  const slots = buildJournalShowSlots({ segments: renderSegments, journalId, baseTime }).filter(
    (slot) => slot.at < new Date(baseTime.getTime() + durationSeconds * 1000)
  );
  const cards = slotsToCards(slots);

  // Bonus-gap filler (fillLeftoverGapsWithBonusCards) must stay journal-scoped
  // too -- the single-journal rule is a hard constraint on the whole show,
  // not just the primary content source, so a content gap must never get
  // filled with a different journal's card.
  const usedIds = new Set(slots.filter((slot) => slot.segment).map((slot) => slot.segment!.id));
  const usedSignatures = new Set(
    slots.filter((slot) => slot.segment).map((slot) => contentSignature(slot.segment!))
  );
  const unusedApproved: Segment[] = [];
  for (const segment of renderSegments) {
    if (segment.status !== "approved" || segment.citations?.[0]?.journalId !== journalId) {
      continue;
    }
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

// Supabase/fetch failures often surface as plain objects (PostgrestError,
// parsed JSON error bodies) rather than Error instances, so template-literal
// interpolation silently collapses them to "[object Object]" -- confirmed on
// a real journal-show test run where this made two real failures
// undiagnosable. Pull out whatever fields exist instead of trusting toString.
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      // falls through to String(error) below
    }
  }
  return String(error);
}

// The post-render segment/metadata writes run once, right after rendering
// finishes, over a plain HTTPS connection from the GH Actions runner -- a
// single dropped connection there silently loses work that already aired
// (confirmed on a real journal-show test: both this and the metadata push
// failed in the same ~2s window while every other network call in the same
// job succeeded). Both operations are idempotent re-reads/re-writes, so a
// short retry is a safe way to ride out a transient blip.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

async function saveBroadcastWriteout(
  cards: Card[],
  youtubeVideoId?: string,
  youtubeUrl?: string,
  title?: string
) {
  const { upsertBroadcastWriteoutInDb } = await import("@/lib/db");
  const startsAt = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const resolvedTitle =
    title ?? process.env.BROADCAST_TITLE ?? `ConferenceHype programming - ${startsAt.toISOString()}`;
  const writeoutCards = buildWriteoutCards(cards, startsAt);
  await upsertBroadcastWriteoutInDb({
    coverageSlotId: process.env.COVERAGE_SLOT_ID || undefined,
    startsAt: startsAt.toISOString(),
    durationMinutes: 60,
    title: resolvedTitle,
    status: youtubeVideoId ? "queued" : "rendering",
    youtubeVideoId,
    youtubeUrl,
    workflowRunId: process.env.GITHUB_RUN_ID || undefined,
    workflowUrl:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
    cards: writeoutCards,
    writeoutMarkdown: buildWriteoutMarkdown(resolvedTitle, writeoutCards)
  });
}

// Renders are now uploaded to YouTube directly instead of streamed live (no
// more RTMP/live-broadcast layer -- see uploadBroadcastVideo.ts), so the
// video doesn't exist yet at this point in the script the way it used to
// (create-youtube-broadcast.ts ran *before* render and bound an empty live
// broadcast shell). This resolves title/description/tags from the cards
// that actually rendered, uploads the finished file with those as the
// video's real metadata from the start, uploads a matching thumbnail, then
// writes the resulting video id to both the writeout and the slot's
// delivery status. Falls back to a generic title (mirroring the old
// pre-render placeholder) if metadata resolution has nothing to work with
// -- a broadcast should still go out even when it's mostly fallback/music
// content.
async function uploadRenderedBroadcast(cards: Card[], usedSegmentIds: string[], isJournalMode: boolean) {
  const hourStart = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();

  let actualMetadata:
    | Awaited<ReturnType<typeof import("@/lib/youtube/broadcastMetadata").buildBroadcastMetadata>>
    | undefined;
  if (usedSegmentIds.length > 0) {
    try {
      actualMetadata = await withRetry(async () => {
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
        // For the 30-minute single-journal show, the title should show the
        // journal issue's own month/date, not the broadcast's air date --
        // pick the most common publishedAt month among the actually-used
        // segments' citations.
        let titleDateOverride: string | undefined;
        if (isJournalMode) {
          const monthCounts = new Map<string, { count: number; sample: string }>();
          for (const segment of usedSegments) {
            const publishedAt = segment.citations?.[0]?.publishedAt;
            if (!publishedAt) continue;
            const monthKey = publishedAt.slice(0, 7);
            const existing = monthCounts.get(monthKey);
            monthCounts.set(monthKey, { count: (existing?.count ?? 0) + 1, sample: existing?.sample ?? publishedAt });
          }
          titleDateOverride = [...monthCounts.values()].sort((a, b) => b.count - a.count)[0]?.sample;
        }
        return buildBroadcastMetadata({
          hourStart,
          conferenceName: activeConference?.acronym ?? activeConference?.name,
          slots,
          journalsById,
          titleDateOverride
        });
      });
    } catch (error) {
      console.log(
        `::warning::Could not build YouTube metadata from actual rendered cards, falling back to generic: ${describeError(error)}`
      );
    }
  }

  const fallbackLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  }).format(hourStart);
  const title =
    process.env.BROADCAST_TITLE ||
    actualMetadata?.title ||
    `ConferenceHype live programming - ${fallbackLabel}`;
  const description =
    actualMetadata?.description ||
    "Source-attributed ConferenceHype medical-conference programming.";
  const tags = actualMetadata?.tags ?? [];
  const categoryId = actualMetadata?.categoryId ?? "27";

  const { assertMediaGenerated } = await import("@/lib/media/youtubeDeliveryVerifier");
  await assertMediaGenerated(outputPath);

  const { getYoutubeAccessToken, uploadVideoToYoutube, uploadYoutubeThumbnail } = await import(
    "@/lib/youtube/uploadBroadcastVideo"
  );
  const accessToken = await getYoutubeAccessToken();
  const uploaded = await withRetry(() =>
    uploadVideoToYoutube({
      filePath: outputPath,
      accessToken,
      title,
      description,
      tags,
      categoryId
    })
  );
  const youtubeVideoId = uploaded.id;
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  console.log(`Uploaded ${youtubeUrl}, public immediately.`);

  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `youtube_video_id=${youtubeVideoId}\nyoutube_url=${youtubeUrl}\n`
    );
  }

  if (actualMetadata) {
    try {
      await uploadYoutubeThumbnail({
        videoId: youtubeVideoId,
        accessToken,
        tier: actualMetadata.tier,
        journalName: actualMetadata.journalName,
        specialty: actualMetadata.specialty,
        dateLabel: actualMetadata.dateLabel,
        siteUrl: process.env.PUBLIC_SITE_URL
      });
    } catch (error) {
      console.log(
        `::warning::Could not set a custom YouTube thumbnail (channel may not be phone-verified yet): ${describeError(error)}`
      );
    }
  }

  if (!isJournalMode) {
    await withRetry(() => saveBroadcastWriteout(cards, youtubeVideoId, youtubeUrl, title));
  }

  // Mark every real, DB-backed segment used in this hour's card list as
  // aired, so it stops being pulled into a future hour's approved-segment
  // pool (getNextBroadcastSegmentsFromDb only selects status="approved").
  // Deliberately only runs after a successful upload -- if the upload
  // fails, these segments stay "approved" and can be reused on a retry.
  if (usedSegmentIds.length > 0) {
    const { markSegmentsRenderedInDb } = await import("@/lib/db");
    await withRetry(() => markSegmentsRenderedInDb(usedSegmentIds)).catch((error) => {
      console.warn(`Failed to mark segments as rendered — the broadcast still airs normally: ${describeError(error)}`);
    });
  }

  const { updateConferenceCoverageDeliveryInDb, updateJournalBroadcastDeliveryInDb } = await import("@/lib/db");
  const workflowUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined;
  const deliveryPatch = {
    youtubeStatus: "queued" as const,
    youtubeVideoId,
    youtubeUrl,
    workflowRunId: process.env.GITHUB_RUN_ID,
    workflowUrl
  };
  if (process.env.JOURNAL_SLOT_ID) {
    await withRetry(() => updateJournalBroadcastDeliveryInDb(process.env.JOURNAL_SLOT_ID, deliveryPatch));
  } else {
    await withRetry(() => updateConferenceCoverageDeliveryInDb(process.env.COVERAGE_SLOT_ID, deliveryPatch));
  }
}

async function main() {
  const ffmpeg = process.env.FFMPEG_PATH ?? ffmpegPath ?? "ffmpeg";
  const useBlockMode = process.env.HOUR_BROADCAST_MODE === "blocks";
  const isJournalMode = process.env.HOUR_BROADCAST_MODE === "journal30";
  const { applySpokenPronunciations } = await import("@/lib/media/tts");
  const { getPersona } = await import("@/lib/generation/personas");
  const { cards: rawCards, unusedApproved } = useBlockMode
    ? { cards: await buildBlockCards(), unusedApproved: [] as Segment[] }
    : isJournalMode
      ? await buildJournalCards()
      : await buildCards();
  const cards = enforceOneHourFrame(
    await fillLeftoverGapsWithBonusCards(
      expandContentDurations(
        replaceEmptyContentCardsWithMusic(
          replaceMissingIntakeCardsWithMusic(
            applyPresentationPolicy(rawCards, isJournalMode ? Infinity : DISCLAIMER_INTERVAL_SECONDS)
          )
        )
      ),
      unusedApproved,
      applySpokenPronunciations,
      getPersona
    ),
    isJournalMode ? JOURNAL_SHOW_SECONDS : 3600
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

  // Guard against publishing a broadcast made of nothing but gap-clip
  // stingers and background music. Confirmed live 2026-07-17 (video
  // YnGo-ddNYv0, journal30 show for a journal with 0 approved segments):
  // with no content cards, main() used to render and upload a near-silent
  // 30-minute video anyway, and the DB's failure record (from an unrelated
  // step further down the workflow) never mentioned the real cause. Bail
  // out here, before the expensive ffmpeg render, with a delivery-status
  // write that says exactly why.
  const contentCardCount = cards.filter((card) => !card.isMusic).length;
  if (contentCardCount === 0) {
    const reason = isJournalMode
      ? "No approved segments were available for this journal at render time -- 0 content cards scheduled, refusing to publish a music-only broadcast."
      : "No approved (or fallback schedule/social) content was available at render time -- 0 content cards scheduled, refusing to publish a music-only broadcast.";
    console.log(`::error::${reason}`);
    const { updateConferenceCoverageDeliveryInDb, updateJournalBroadcastDeliveryInDb } = await import("@/lib/db");
    const workflowUrl =
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined;
    const failurePatch = {
      youtubeStatus: "failed" as const,
      deliveryError: reason,
      workflowRunId: process.env.GITHUB_RUN_ID,
      workflowUrl
    };
    if (process.env.JOURNAL_SLOT_ID) {
      await updateJournalBroadcastDeliveryInDb(process.env.JOURNAL_SLOT_ID, failurePatch).catch((error) => {
        console.warn(`Failed to record the no-content failure reason: ${describeError(error)}`);
      });
    } else if (process.env.COVERAGE_SLOT_ID) {
      await updateConferenceCoverageDeliveryInDb(process.env.COVERAGE_SLOT_ID, failurePatch).catch((error) => {
        console.warn(`Failed to record the no-content failure reason: ${describeError(error)}`);
      });
    }
    if (process.env.GITHUB_OUTPUT) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_OUTPUT, `no_content_failure_recorded=true\n`);
    }
    throw new Error(reason);
  }

  // Every real, DB-backed segment used in this hour's card list -- marked
  // rendered (and the writeout/delivery-status written with the real
  // YouTube video id) only after a successful upload, in
  // uploadRenderedBroadcast() below. If the upload never happens, these
  // segments stay "approved" and are eligible for a retry instead of being
  // silently consumed by a broadcast that never actually delivered.
  const usedSegmentIds = [
    ...new Set(
      cards
        .filter((card) => card.segmentId)
        .map((card) => card.segmentId!)
    )
  ];

  await mkdir(renderDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  // Per-card Kokoro TTS with file caching — batch synthesis (model loaded
  // once). This now runs BEFORE slide generation and the offset/timeline
  // pass below (previously it ran after both): scheduling every card's
  // slide duration and audio placement off expandContentDurations' word-count
  // estimate is what let a card's real narration keep playing after the next
  // card's audio was told to start -- audible overlap, most exposed in the
  // 30-minute journal show where three of every four transitions are
  // voice-straight-into-voice with no music buffer to absorb the overrun.
  // Synthesizing first lets every later step use each card's REAL length.
  const voiceCacheDir = path.join(renderDir, "voice-cache");
  const voiceWavDir = path.join(voiceCacheDir, "wav-tmp");
  await mkdir(voiceCacheDir, { recursive: true });
  await mkdir(voiceWavDir, { recursive: true });

  type SynthTask = { voice: string; text: string; wavPath: string; cachePath: string };
  const taskByCacheKey = new Map<string, SynthTask>();
  // Parallel to `cards` -- which cacheKey (if any) each card resolves to.
  // Multiple distinct card slots can share an identical cacheKey -- most
  // commonly the BROADCAST_DISCLAIMER card, which is the exact same text and
  // persona every time it's inserted (every ~15 minutes, so 2-3x per hour).
  // Synthesis itself is deduplicated by cacheKey below, but every occurrence
  // still needs its own scheduled slot, hence tracking this per card position.
  const cardCacheKeys: (string | undefined)[] = cards.map(() => undefined);

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card.isMusic || !card.script || !card.personaId) {
      continue;
    }
    const persona = getPersona(card.personaId);
    const voiceName = process.env[persona.voiceEnvKey];
    if (!voiceName) {
      continue;
    }
    const processedScript = applySpokenPronunciations(card.script);
    // replaceEmptyContentCardsWithMusic already screened out cards whose RAW
    // script is empty, but applySpokenPronunciations (stripping URLs,
    // bracketed citations, and internal operator-language sentences) can
    // still reduce a genuinely non-empty script down to "" -- e.g. a card
    // whose entire content is a bare URL or a single internal-label sentence
    // like "Source-only schedule confirmed for this session." Kokoro doesn't
    // throw on empty text itself; it just returns zero audio chunks, and
    // concatenating zero chunks downstream is what actually raised. Skip
    // creating a synthesis task at all in that case rather than handing
    // Kokoro text with nothing to say.
    if (!processedScript.trim()) {
      console.warn(
        `Skipping voice synthesis for a card whose script became empty after pronunciation cleanup (persona ${persona.voiceEnvKey}).`
      );
      continue;
    }
    const cacheKey = createHash("sha256")
      .update(`${persona.voiceEnvKey}|${processedScript}`)
      .digest("hex");
    cardCacheKeys[index] = cacheKey;
    if (!taskByCacheKey.has(cacheKey)) {
      const cachePath = path.join(voiceCacheDir, `${cacheKey}.mp3`);
      const wavPath = path.join(voiceWavDir, `${cacheKey}.wav`);
      taskByCacheKey.set(cacheKey, { voice: voiceName, text: processedScript, wavPath, cachePath });
    }
  }

  const tasks = [...taskByCacheKey.values()].filter((task) => !existsSync(task.cachePath));

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
  }

  // Measure every unique voice clip's REAL duration (freshly synthesized or
  // reused from cache) instead of trusting the word-count estimate. Real
  // Kokoro output routinely runs longer than that estimate -- it doesn't
  // account for the 1.15x speaking rate or the 0.12s pause inserted per
  // line -- which is exactly what let a card's audio still be playing when
  // the next card's audio started.
  const durationByCacheKey = new Map<string, number>();
  for (const [cacheKey, task] of taskByCacheKey) {
    if (!existsSync(task.cachePath)) {
      continue; // synthesis or conversion failed for this card -- word-count estimate stands
    }
    try {
      durationByCacheKey.set(cacheKey, await probeAudioDurationSeconds(ffmpeg, task.cachePath));
    } catch (error) {
      console.warn(
        `Could not measure real audio duration for a synthesized card, falling back to its word-count estimate: ${describeError(error)}`
      );
    }
  }

  // Small fixed pad so adjacent voice cards never share a hard, zero-gap
  // jump-cut, and so a fractional-second probe reading always rounds up
  // safely rather than shaving a hair off the real clip.
  const VOICE_CARD_PAD_SECONDS = 0.4;

  for (let index = 0; index < cards.length; index += 1) {
    const cacheKey = cardCacheKeys[index];
    if (!cacheKey) {
      continue;
    }
    const measuredSeconds = durationByCacheKey.get(cacheKey);
    if (measuredSeconds === undefined) {
      continue;
    }
    const estimatedSeconds = cards[index].duration;
    const correctedSeconds = Math.ceil(measuredSeconds) + VOICE_CARD_PAD_SECONDS;
    cards[index].duration = correctedSeconds;
    // Mirrors expandContentDurations' own slack rule: only ever hand leftover
    // time forward into a following music card, never borrow time back from
    // one. An overrun (real audio longer than estimated) simply makes the
    // show run a little long instead of shrinking anything -- a fully
    // acceptable trade for correctness given the alternative is overlapping
    // voices or a hard mid-sentence cutoff.
    const slack = estimatedSeconds - correctedSeconds;
    const nextCard = cards[index + 1];
    if (slack > 0 && nextCard?.isMusic) {
      nextCard.duration += slack;
    }
  }

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

  type VoiceEntry = { path: string; startMs: number; durationMs: number };
  type GapEntry = { path: string; startMs: number };
  type BedEntry = { startMs: number; durationMs: number };
  const voiceEntries: VoiceEntry[] = [];
  const gapEntries: GapEntry[] = [];    // gap-clip stingers, one per music card
  // Music-bed windows, one per music-kind card -- confined to that card's own
  // slot so the bed only ever plays during an actual gap, never under voice.
  const bedEntries: BedEntry[] = [];
  let offsetMs = 0;

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    // Rule 9: the music bed only plays inside a music-kind card's own slot,
    // never under voice -- previously it looped continuously for the whole
    // hour and got mixed under every voice card too, confirmed as a real
    // bug from a live operator report (background music audible "often",
    // not just between cards) rather than the intended gap-only sound.
    if (card.isMusic) {
      bedEntries.push({ startMs: offsetMs, durationMs: card.duration * 1000 });
      // Rule 7: collect gap-clip start times for music cards
      if (card.gapClipPath) {
        const resolvedGap = path.resolve(card.gapClipPath);
        if (existsSync(resolvedGap)) {
          gapEntries.push({ path: resolvedGap, startMs: offsetMs });
        }
      }
    }

    // Every occurrence of a cacheKey gets its own voiceEntry at its own
    // startMs, even when several slots share one synthesized mp3 (e.g. the
    // BROADCAST_DISCLAIMER card, which repeats verbatim every ~15 minutes) --
    // confirmed 2026-07-06 that reusing only the first slot's entry silently
    // dropped narration from later repeats.
    const cacheKey = cardCacheKeys[index];
    if (cacheKey) {
      const cachePath = path.join(voiceCacheDir, `${cacheKey}.mp3`);
      if (existsSync(cachePath)) {
        voiceEntries.push({ path: cachePath, startMs: offsetMs, durationMs: card.duration * 1000 });
      }
    }

    offsetMs += card.duration * 1000;
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
      // e.durationMs now comes from the card's real measured audio duration
      // (plus VOICE_CARD_PAD_SECONDS), not a word-count guess, so atrim no
      // longer needs a blind safety margin to avoid cutting off a card's
      // last words -- the window already covers the real clip length.
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

  await uploadRenderedBroadcast(cards, usedSegmentIds, isJournalMode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
