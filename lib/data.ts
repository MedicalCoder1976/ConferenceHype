import { sourceRegistry } from "@/lib/sources/registry";
import {
  buildScheduleFallbackSegment,
  buildScheduleRundownSegments
} from "@/lib/jobs/upcomingEvents";
import {
  getAnalyticsFromDb,
  getAiredSegmentsFromDb,
  getApprovedSegmentsFromDb,
  getBlacklistedXHandlesFromDb,
  getBroadcastWriteoutsFromDb,
  getConferenceCoverageSlotsFromDb,
  getCurrentYoutubeDeliveryFromDb,
  getDailyCoveragePlanFromDb,
  getEditorialPackagesFromDb,
  getJournalBroadcastSlotsFromDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getNextBroadcastSegmentsFromDb,
  getPendingSegmentsFromDb,
  getPlatformSmokeRunsFromDb,
  getPreviousDayBatchItemsFromDb,
  getRecentSocialItemsFromDb,
  getSourcesFromDb,
  getStreamStateFromDb,
  getSpecialtyXVoicesFromDb,
  upsertAdminCatalogSeedsToDb,
  getXFollowVoicesFromDb
} from "@/lib/db";
import {
  buildSocialVoiceLeaderboard,
  shouldRunSocialVoiceCompetition
} from "@/lib/social/leaderboard";
import {
  createDefaultDailyCoveragePlan,
  normalizeLegacyDailyCoverageDefaults
} from "@/lib/dailyCoverage";
import { getUnsafeReviewSourceErrors } from "@/lib/generation/sourceSafety";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import type {
  AnalyticsSnapshot,
  BroadcastWriteout,
  BroadcastWriteoutCard,
  Citation,
  Segment,
  StreamState
} from "@/lib/types";

const fullSpokenDisclaimer =
  "ConferenceHype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice.";

function isUnsafeForBroadcastRundown(scriptish: string) {
  return (
    scriptish.includes(fullSpokenDisclaimer) ||
    /\b(early social chatter|unverified buzz|operator-selected audience tip|audience tip|snack|coffee|hallway energy|rising energy|pending review|we verify|verify|verified|airtime|aired|airing|air)\b/i.test(
      scriptish
    )
  );
}

function hasVerifiedBroadcastSource(segment: { script: string; summary: string; citations: Citation[]; contentType: string }) {
  if (segment.contentType === "agenda_preview" || segment.contentType === "industry_floor") {
    return true;
  }
  return segment.citations.some((citation) =>
    ["official", "media", "verified_social", "general_social", "company"].includes(citation.sourceType)
  );
}

export function filterBroadcastReadySegments<T extends {
  title?: string;
  script: string;
  summary: string;
  citations: Citation[];
  contentType: string;
  riskFlags?: string[];
}>(
  segments: T[]
) {
  return segments.filter((segment) => {
    const text = `${segment.summary}\n${segment.script}`;
    const isLegacyCopiedSourceCard =
      segment.riskFlags?.includes("rss_latest_source_card") &&
      !segment.riskFlags.includes("genuine_source_rewrite");
    const isLegacyUntaggedBatchCard =
      segment.riskFlags?.includes("previous_day_batch_intake") &&
      !segment.riskFlags.some((flag) => flag.startsWith("source_id:"));
    const isAutoScheduleSpine =
      segment.riskFlags?.includes("no_llm_schedule_spine") ||
      segment.riskFlags?.includes("official_schedule_only") ||
      /^Official (?:meeting )?schedule/i.test(text) ||
      /^Official (?:meeting )?schedule/i.test(String(segment.title ?? ""));
    const isWeeklySourceContext = segment.riskFlags?.includes("weekly_source_context");
    return (
      !isLegacyCopiedSourceCard &&
      !isLegacyUntaggedBatchCard &&
      !isAutoScheduleSpine &&
      !isWeeklySourceContext &&
      !hasMissingIntakeFailureLanguage(`${segment.title ?? ""}\n${text}`) &&
      !isUnsafeForBroadcastRundown(text) &&
      hasVerifiedBroadcastSource(segment) &&
      getUnsafeReviewSourceErrors({
        title: "",
        summary: segment.summary,
        script: segment.script,
        citations: segment.citations
      }).length === 0
    );
  });
}

export async function getPublicSegments() {
  const dbSegments = await getApprovedSegmentsFromDb();
  const filtered = (dbSegments ?? []).filter(
    (s) =>
      !s.riskFlags.includes("platform_smoke_test") &&
      !s.riskFlags.includes("weekly_source_context")
  );
  return filtered.length ? filtered : [buildScheduleFallbackSegment()];
}

export type PublicBroadcastCard = {
  id: string;
  position: number;
  startsAt?: string;
  durationSeconds?: number;
  title: string;
  summary: string;
  personaName?: string;
  sourceLabel?: string;
  sourceUrl?: string;
};

export type PublicBroadcastContext = {
  streamState: StreamState;
  cards: PublicBroadcastCard[];
  currentCard?: PublicBroadcastCard;
  source: "writeout" | "approved_segments" | "stream_without_writeout";
};

function cardSummary(card: BroadcastWriteoutCard) {
  const script = card.script?.replace(/\s+/g, " ").trim();
  if (!script) {
    return "Broadcast transition.";
  }
  return script.length > 260 ? `${script.slice(0, 257).trim()}...` : script;
}

function publicCardFromWriteout(card: BroadcastWriteoutCard): PublicBroadcastCard {
  return {
    id: `writeout-${card.position}-${card.startsAt}`,
    position: card.position,
    startsAt: card.startsAt,
    durationSeconds: card.durationSeconds,
    title: card.title,
    summary: cardSummary(card),
    personaName: card.personaName,
    sourceLabel: card.sourceLabel,
    sourceUrl: card.sourceUrl
  };
}

function publicCardFromSegment(segment: Segment, index: number): PublicBroadcastCard {
  return {
    id: segment.id,
    position: index + 1,
    startsAt: segment.approvedAt,
    title: segment.title,
    summary: segment.summary,
    personaName: segment.personaName,
    sourceLabel: segment.citations[0]?.label,
    sourceUrl: segment.citations[0]?.url
  };
}

function findMatchingWriteout({
  writeouts,
  streamState
}: {
  writeouts: BroadcastWriteout[];
  streamState: StreamState;
}) {
  if (streamState.youtubeVideoId) {
    return writeouts.find(
      (writeout) => writeout.youtubeVideoId === streamState.youtubeVideoId
    );
  }
  if (streamState.youtubeStatus === "failed" || streamState.youtubeStatus === "rendering") {
    return undefined;
  }
  return writeouts.find((writeout) =>
    ["queued", "rendering", "live", "completed"].includes(writeout.status)
  );
}

function currentWriteoutCard(cards: PublicBroadcastCard[], now = new Date()) {
  const timedCards = cards.filter((card) => card.startsAt && card.durationSeconds);
  const exactMatch = timedCards.find((card) => {
    const start = new Date(card.startsAt!).getTime();
    const end = start + (card.durationSeconds ?? 0) * 1000;
    return now.getTime() >= start && now.getTime() < end;
  });
  if (exactMatch) {
    return exactMatch;
  }
  // No card's window contains "now" exactly (a card ran slightly long, or
  // "now" lands in a rounding gap between two cards). Falling straight back
  // to cards[0] here made the publicly displayed "current topic" regularly
  // jump back to the very first card of the hour instead of the most recent
  // real one. Prefer the most recently started card; only show the first
  // card if the hour genuinely has not started yet.
  const mostRecentlyStarted = [...timedCards]
    .filter((card) => new Date(card.startsAt!).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.startsAt!).getTime() - new Date(a.startsAt!).getTime())[0];
  return mostRecentlyStarted ?? cards[0];
}

// Delivery switched from a live RTMP stream to render-then-upload: nothing
// writes youtube_status="live"/"completed" to the database anymore (the
// terminal success status is "queued" -- rendered, uploaded, and scheduled
// via YouTube's own publishAt). The public site's "Live now" / "Current
// topic" experience is unchanged from a viewer's perspective, but the
// underlying "is it live right now" fact has to be derived from wall-clock
// time against the card schedule baked into the writeout at render time,
// instead of read from a stored status. currentWriteoutCard() below already
// works this same way for individual cards; this does the same at the
// whole-show level.
function deriveDisplayYoutubeStatusFromWindow(
  storedStatus: StreamState["youtubeStatus"],
  window: { startMs: number; durationMs: number },
  now = new Date()
): StreamState["youtubeStatus"] {
  if (storedStatus !== "queued") {
    return storedStatus;
  }
  const nowMs = now.getTime();
  if (nowMs < window.startMs) {
    return storedStatus;
  }
  return nowMs < window.startMs + window.durationMs ? "live" : "completed";
}

function deriveDisplayYoutubeStatus(
  storedStatus: StreamState["youtubeStatus"],
  cards: PublicBroadcastCard[],
  now = new Date()
): StreamState["youtubeStatus"] {
  const timedCards = cards.filter((card) => card.startsAt && card.durationSeconds);
  if (timedCards.length === 0) {
    return storedStatus;
  }
  const startMs = Math.min(...timedCards.map((card) => new Date(card.startsAt!).getTime()));
  const endMs = Math.max(
    ...timedCards.map((card) => new Date(card.startsAt!).getTime() + (card.durationSeconds ?? 0) * 1000)
  );
  return deriveDisplayYoutubeStatusFromWindow(storedStatus, { startMs, durationMs: endMs - startMs }, now);
}

export async function getPublicBroadcastContext(): Promise<PublicBroadcastContext> {
  const [streamState, writeouts, approvedSegments] = await Promise.all([
    getStreamState(),
    getBroadcastWriteoutsFromDb(20),
    getPublicSegments()
  ]);
  const matchingWriteout = findMatchingWriteout({
    writeouts: writeouts ?? [],
    streamState
  });
  // card.position is the card's index in the full interleaved
  // content+music sequence (see buildWriteoutCards in
  // render-hour-broadcast.ts), so content cards alone land at every other
  // position (1, 3, 5, ...) once the music cards are filtered out below.
  // Renumber sequentially here so the public "Broadcast rundown" list reads
  // 1, 2, 3, ... instead of only odd numbers -- id generation still uses the
  // original position, so ids stay unique.
  const writeoutCards =
    matchingWriteout?.cards
      .filter(
        (card) =>
          card.kind === "content" &&
          !card.riskFlags?.includes("platform_smoke_test") &&
          !card.riskFlags?.includes("weekly_source_context")
      )
      .map((card, index) => ({ ...publicCardFromWriteout(card), position: index + 1 })) ?? [];

  if (writeoutCards.length) {
    return {
      streamState: {
        ...streamState,
        youtubeStatus: deriveDisplayYoutubeStatus(streamState.youtubeStatus, writeoutCards)
      },
      cards: writeoutCards,
      currentCard: currentWriteoutCard(writeoutCards),
      source: "writeout"
    };
  }

  if (streamState.youtubeVideoId) {
    // Journal-mode broadcasts never write a broadcast_writeouts row (see
    // render-hour-broadcast.ts's isJournalMode guard), so they always land
    // here rather than the "writeout" branch above -- meaning they'd never
    // get the same wall-clock-derived live/completed status. Look the video
    // up directly in whichever slot table has it and derive the same way,
    // using the slot's own scheduled window instead of card timings.
    const [conferenceSlots, journalSlots] = await Promise.all([
      getConferenceCoverageSlotsFromDb(),
      getJournalBroadcastSlotsFromDb()
    ]);
    const matchingConferenceSlot = (conferenceSlots ?? []).find(
      (slot) => slot.youtubeVideoId === streamState.youtubeVideoId
    );
    const matchingJournalSlot = (journalSlots ?? []).find(
      (slot) => slot.youtubeVideoId === streamState.youtubeVideoId
    );
    const scheduledWindow = matchingJournalSlot
      ? {
          startMs: new Date(matchingJournalSlot.startsAt).getTime(),
          durationMs: matchingJournalSlot.durationMinutes * 60_000
        }
      : matchingConferenceSlot
        ? {
            startMs: new Date(matchingConferenceSlot.startsAt).getTime(),
            durationMs: matchingConferenceSlot.durationHours * 3_600_000
          }
        : undefined;
    return {
      streamState: {
        ...streamState,
        youtubeStatus: scheduledWindow
          ? deriveDisplayYoutubeStatusFromWindow(streamState.youtubeStatus, scheduledWindow)
          : streamState.youtubeStatus
      },
      cards: [],
      currentCard: undefined,
      source: "stream_without_writeout"
    };
  }

  const cards = approvedSegments.map(publicCardFromSegment);
  return {
    streamState,
    cards,
    currentCard: cards[0],
    source: "approved_segments"
  };
}

export async function getStreamState(): Promise<StreamState> {
  const [dbStreamState, youtubeDelivery] = await Promise.all([
    getStreamStateFromDb(),
    getCurrentYoutubeDeliveryFromDb()
  ]);
  const fallbackState: StreamState = {
    mode: process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID
      ? "youtube_primary"
      : process.env.NEXT_PUBLIC_HLS_URL
        ? "hls_fallback"
        : "preview",
    emergencyActive: false,
    emergencyMessage:
      "ConferenceHype automation is paused while the operator desk reviews the queue.",
    currentSegmentId: undefined
  };
  const suppressYoutubeFallback =
    dbStreamState?.youtubeStatus === "failed" || dbStreamState?.youtubeStatus === "rendering";
  return {
    ...(dbStreamState ?? fallbackState),
    mode: dbStreamState?.youtubeVideoId || (!suppressYoutubeFallback && youtubeDelivery?.youtubeVideoId)
      ? "youtube_primary"
      : (dbStreamState ?? fallbackState).mode,
    youtubeVideoId:
      dbStreamState?.youtubeVideoId ??
      (suppressYoutubeFallback
        ? undefined
        : (youtubeDelivery?.youtubeVideoId ?? process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID)),
    youtubeUrl: dbStreamState?.youtubeUrl ?? (suppressYoutubeFallback ? undefined : youtubeDelivery?.youtubeUrl),
    youtubeStatus:
      dbStreamState?.youtubeStatus ?? (suppressYoutubeFallback ? undefined : youtubeDelivery?.youtubeStatus)
  };
}

export async function getAdminSnapshot(baseTime = new Date(), planningHours = 1) {
  await upsertAdminCatalogSeedsToDb();
  const xFollowVoices = (await getXFollowVoicesFromDb()) ?? [];
  const blacklistedXHandles = (await getBlacklistedXHandlesFromDb()) ?? [];
  const recentSocialItems = (await getRecentSocialItemsFromDb(24)) ?? [];
  const socialVoiceLeaderboard = buildSocialVoiceLeaderboard(
    recentSocialItems,
    xFollowVoices,
    blacklistedXHandles
  );
  // Higher than the 120 default so the per-entity card-deck counts (weekly
  // batch cards accumulate over time) don't silently undercount once a
  // catalog has been running for a few weeks.
  const pendingSegments = filterBroadcastReadySegments(
    (await getPendingSegmentsFromDb(1000)) ?? []
  );
  // Use the same generous limit as the render script so recently-scheduled
  // cards (which sort to the end of the approved_at ASC order) are always
  // included. 42 was too small: if the pool had 43+ approved segments the
  // newly-pinned card was silently dropped and the UI reverted after refresh.
  const nextBroadcastSegments = filterBroadcastReadySegments(
    (await getNextBroadcastSegmentsFromDb(200)) ?? []
  );
  const scheduleRundownSegments = buildScheduleRundownSegments(baseTime, planningHours);
  const airedSegments = (await getAiredSegmentsFromDb(200)) ?? [];
  const broadcastWriteouts = (await getBroadcastWriteoutsFromDb()) ?? [];
  const specialtyXVoices = (await getSpecialtyXVoicesFromDb()) ?? [];
  const medicalConferences = (await getMedicalConferencesFromDb()) ?? [];
  const conferenceCoverageSlots = (await getConferenceCoverageSlotsFromDb()) ?? [];
  const journalBroadcastSlots = (await getJournalBroadcastSlotsFromDb()) ?? [];
  const oncologyJournals = (await getOncologyJournalsFromDb()) ?? [];
  const editorialPackages = (await getEditorialPackagesFromDb()) ?? [];
  const platformSmokeRuns = (await getPlatformSmokeRunsFromDb(30)) ?? [];
  const sources = (await getSourcesFromDb()) ?? sourceRegistry;
  const coverageDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(baseTime);
  const savedDailyCoveragePlan = await getDailyCoveragePlanFromDb(coverageDate);
  const batchIntakeItems = (await getPreviousDayBatchItemsFromDb(coverageDate, 160)) ?? [];
  const dailyCoveragePlan = normalizeLegacyDailyCoverageDefaults({
    plan:
      savedDailyCoveragePlan ??
      createDefaultDailyCoveragePlan({
        coverageDate,
        conferences: medicalConferences
      }),
    journals: oncologyJournals,
    conferences: medicalConferences,
    sources
  });
  const analytics: AnalyticsSnapshot = (await getAnalyticsFromDb()) ?? {
    views: 128,
    clipsCreated: 4,
    pendingReview: pendingSegments.length
  };
  return {
    pendingSegments,
    nextBroadcastSegments,
    scheduleRundownSegments,
    airedSegments,
    broadcastWriteouts,
    platformSmokeRuns,
    streamState: await getStreamState(),
    sources,
    xFollowVoices,
    blacklistedXHandles,
    socialVoiceLeaderboard,
    specialtyXVoices,
    medicalConferences,
    conferenceCoverageSlots,
    journalBroadcastSlots,
    oncologyJournals,
    editorialPackages,
    dailyCoveragePlan,
    batchIntakeItems,
    nextSocialVoiceCompetition:
      "Leaderboard refreshes from recent X/social ingest; top traction voices are added to Source intake every 15-minute generation cycle. The scoreboard card is available in every approved one-hour block.",
    socialVoiceCompetitionDueNow: shouldRunSocialVoiceCompetition(),
    analytics
  };
}
