import { defaultDisclaimer } from "@/lib/generation/disclaimers";
import { sourceRegistry } from "@/lib/sources/registry";
import {
  getAnalyticsFromDb,
  getApprovedSegmentsFromDb,
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
import type { AnalyticsSnapshot, Segment, StreamState } from "@/lib/types";

const now = new Date().toISOString();

export const mockSegments: Segment[] = [
  {
    id: "seg-echo-agenda",
    title: "TumorCrusher Fenrir, Rebecca, AussieOnc, and Adam ASCO 2026 run",
    summary:
      "TumorCrusher opens the ASCO 2026 Day 1 test run with Fenrir handling the schedule, Rebecca reporting with high-hype DJ energy, AussieOnc bringing global hype, and Adam reading social media with snark.",
    script: `${defaultDisclaimer}\n\nWelcome to ASCO Hype. We are watching the 2026 annual meeting buildup like a live conference desk: agenda previews, media roundups, exhibitor signals, and the social posts people tag with #ASCOHype, #ASCO26, or @ASCOHypeAI. The key thing to remember: social posts are buzz, not confirmation, until they are checked against stronger sources.\n\nReminder: ${defaultDisclaimer}`,
    contentType: "agenda_preview",
    personaId: "echo-sage",
    personaName: "TumorCrusher",
    hypeLevel: "standard",
    language: "English",
    status: "approved",
    citations: [
      {
        label: "ASCO meeting site",
        url: "https://meetings.asco.org/",
        sourceType: "official"
      }
    ],
    socialBuzzItems: [],
    riskFlags: [],
    confidenceScore: 94,
    createdAt: now
  },
  {
    id: "seg-social-loop",
    title: "How the ASCO Hype hashtag gets on the desk",
    summary:
      "A short operator-ready explainer for audience posts, bot mentions, and the social buzz review path.",
    script: `${defaultDisclaimer}\n\nIf you want the desk to see a post, tag #ASCOHype, #AskASCOHype, #ASCO26, or @ASCOHypeAI. The post enters the social signal intake, gets labeled as audience buzz, and waits for operator approval before any commentary airs.\n\nReminder: ${defaultDisclaimer}`,
    contentType: "social_signal",
    personaId: "vesper-quill",
    personaName: "Vesper Quill",
    hypeLevel: "high_energy",
    language: "English",
    status: "pending_review",
    citations: [
      {
        label: "ASCO Hype source policy",
        url: "https://asco-hype.example.com/admin",
        sourceType: "manual"
      }
    ],
    socialBuzzItems: [
      {
        label: "#ASCOHype monitored tag",
        url: "https://x.com/hashtag/ASCOHype",
        sourceType: "general_social"
      }
    ],
    riskFlags: ["social_buzz_requires_review"],
    confidenceScore: 88,
    createdAt: now
  }
];

export async function getPublicSegments() {
  const dbSegments = await getApprovedSegmentsFromDb();
  return dbSegments ?? mockSegments.filter((segment) => segment.status === "approved");
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
    currentSegmentId: mockSegments[0]?.id
  };
}

export async function getAdminSnapshot() {
  const xFollowVoices = (await getXFollowVoicesFromDb()) ?? [];
  const recentSocialItems = (await getRecentSocialItemsFromDb(3)) ?? [];
  const socialVoiceLeaderboard = buildSocialVoiceLeaderboard(
    recentSocialItems,
    xFollowVoices
  );
  const pendingSegments = (await getPendingSegmentsFromDb()) ?? mockSegments.filter(
    (segment) => segment.status === "pending_review"
  );
  const analytics: AnalyticsSnapshot = (await getAnalyticsFromDb()) ?? {
    views: 128,
    clipsCreated: 4,
    pendingReview: pendingSegments.length
  };
  return {
    pendingSegments,
    streamState: await getStreamState(),
    sources: (await getSourcesFromDb()) ?? sourceRegistry,
    xFollowVoices,
    socialVoiceLeaderboard,
    nextSocialVoiceCompetition:
      "Runs from the generation job during every third UTC hour.",
    socialVoiceCompetitionDueNow: shouldRunSocialVoiceCompetition(),
    analytics
  };
}
