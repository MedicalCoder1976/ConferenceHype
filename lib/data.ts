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
  getDailyCoveragePlanFromDb,
  getEditorialPackagesFromDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getNextBroadcastSegmentsFromDb,
  getPendingSegmentsFromDb,
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
import { getUnsafeReviewSourceErrors } from "@/lib/generation/sourceSafety";
import type { AnalyticsSnapshot, Citation, StreamState } from "@/lib/types";

const fullSpokenDisclaimer =
  "ASCO Hype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice. ASCO Hype is not associated with the American Society of Clinical Oncology in any way.";

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
  const dbStreamState = await getStreamStateFromDb();
  if (dbStreamState) {
    return dbStreamState;
  }
  return {
    mode: process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID
      ? "youtube_primary"
      : process.env.NEXT_PUBLIC_HLS_URL
        ? "hls_fallback"
        : "preview",
    emergencyActive: false,
    emergencyMessage:
      "ASCO Hype automation is paused while the operator desk reviews the queue.",
    currentSegmentId: undefined
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
  const dailyCoveragePlan = savedDailyCoveragePlan ?? {
    coverageDate,
    conferenceIds: medicalConferences
      .filter(
        (conference) =>
          conference.startDate &&
          conference.endDate &&
          coverageDate >= conference.startDate &&
          coverageDate <= conference.endDate
      )
      .map((conference) => conference.id),
    journalIds: oncologyJournals.filter((journal) => journal.enabled).map((journal) => journal.id),
    sourceIds: sources.filter((source) => source.enabled).map((source) => source.id),
    customItems: [],
    priorityTopics: [],
    exclusions: [],
    breakingNewsEnabled: true,
    notes: ""
  };
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
    nextSocialVoiceCompetition:
      "Leaderboard refreshes from recent X/social ingest; top traction voices are added to Source intake every 15-minute generation cycle. The scoreboard card is available in every approved one-hour block.",
    socialVoiceCompetitionDueNow: shouldRunSocialVoiceCompetition(),
    analytics
  };
}
