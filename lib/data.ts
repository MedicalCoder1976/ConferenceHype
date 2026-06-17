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
import type { AnalyticsSnapshot, Citation, StreamState } from "@/lib/types";

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
    return (
      !isLegacyCopiedSourceCard &&
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
  return {
    ...(dbStreamState ?? fallbackState),
    mode: dbStreamState?.youtubeVideoId || youtubeDelivery?.youtubeVideoId
      ? "youtube_primary"
      : (dbStreamState ?? fallbackState).mode,
    youtubeVideoId:
      dbStreamState?.youtubeVideoId ??
      youtubeDelivery?.youtubeVideoId ??
      process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID,
    youtubeUrl: dbStreamState?.youtubeUrl ?? youtubeDelivery?.youtubeUrl,
    youtubeStatus: dbStreamState?.youtubeStatus ?? youtubeDelivery?.youtubeStatus
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
