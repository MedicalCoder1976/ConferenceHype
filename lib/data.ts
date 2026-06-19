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
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getNextBroadcastSegmentsFromDb,
  getPendingSegmentsFromDb,
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
    ["official", "media", "verified_social", "company"].includes(citation.sourceType)
  );
}

export function filterBroadcastReadySegments<T extends {
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
    const isAutoScheduleSpine =
      segment.riskFlags?.includes("no_llm_schedule_spine") ||
      segment.riskFlags?.includes("official_schedule_only") ||
      /^Official (?:meeting )?schedule/i.test(text) ||
      /^Official (?:meeting )?schedule/i.test("title" in segment ? String(segment.title) : "");
    return (
      !isLegacyCopiedSourceCard &&
      !isAutoScheduleSpine &&
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
  return dbSegments?.length ? dbSegments : [buildScheduleFallbackSegment()];
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
  return (
    timedCards.find((card) => {
      const start = new Date(card.startsAt!).getTime();
      const end = start + (card.durationSeconds ?? 0) * 1000;
      return now.getTime() >= start && now.getTime() < end;
    }) ??
    cards[0]
  );
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
  const writeoutCards =
    matchingWriteout?.cards
      .filter((card) => card.kind === "content")
      .map(publicCardFromWriteout) ?? [];

  if (writeoutCards.length) {
    return {
      streamState,
      cards: writeoutCards,
      currentCard: currentWriteoutCard(writeoutCards),
      source: "writeout"
    };
  }

  if (streamState.youtubeVideoId) {
    return {
      streamState,
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
  const pendingSegments = filterBroadcastReadySegments(
    (await getPendingSegmentsFromDb()) ?? []
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
  const oncologyJournals = (await getOncologyJournalsFromDb()) ?? [];
  const editorialPackages = (await getEditorialPackagesFromDb()) ?? [];
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
    streamState: await getStreamState(),
    sources,
    xFollowVoices,
    blacklistedXHandles,
    socialVoiceLeaderboard,
    specialtyXVoices,
    medicalConferences,
    conferenceCoverageSlots,
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
