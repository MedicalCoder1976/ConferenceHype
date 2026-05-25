import { sourceRegistry } from "@/lib/sources/registry";
import {
  buildScheduleFallbackSegment,
  buildScheduleRundownSegments
} from "@/lib/jobs/upcomingEvents";
import {
  getAnalyticsFromDb,
  getAiredSegmentsFromDb,
  getApprovedSegmentsFromDb,
  getNextBroadcastSegmentsFromDb,
  getPendingSegmentsFromDb,
  getRecentSocialItemsFromDb,
  getSourcesFromDb,
  getStreamStateFromDb,
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
    /\b(early social chatter|unverified buzz|operator-selected audience tip|audience tip|snack|coffee|hallway energy|rising energy|pending review)\b/i.test(
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

export function filterBroadcastReadySegments<T extends { script: string; summary: string; citations: Citation[]; contentType: string }>(
  segments: T[]
) {
  return segments.filter((segment) => {
    const text = `${segment.summary}\n${segment.script}`;
    return (
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

export async function getAdminSnapshot(baseTime = new Date()) {
  const xFollowVoices = (await getXFollowVoicesFromDb()) ?? [];
  const recentSocialItems = (await getRecentSocialItemsFromDb(24)) ?? [];
  const socialVoiceLeaderboard = buildSocialVoiceLeaderboard(
    recentSocialItems,
    xFollowVoices
  );
  const pendingSegments = filterBroadcastReadySegments(
    (await getPendingSegmentsFromDb()) ?? []
  );
  const nextBroadcastSegments = filterBroadcastReadySegments(
    (await getNextBroadcastSegmentsFromDb()) ?? []
  );
  const scheduleRundownSegments = buildScheduleRundownSegments(baseTime);
  const airedSegments = (await getAiredSegmentsFromDb()) ?? [];
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
    streamState: await getStreamState(),
    sources: (await getSourcesFromDb()) ?? sourceRegistry,
    xFollowVoices,
    socialVoiceLeaderboard,
    nextSocialVoiceCompetition:
      "Leaderboard refreshes from recent X/social ingest; top traction voices are added to Source intake every 15-minute generation cycle. The scoreboard card still airs every third UTC hour.",
    socialVoiceCompetitionDueNow: shouldRunSocialVoiceCompetition(),
    analytics
  };
}
