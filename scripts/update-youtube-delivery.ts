import { loadEnvConfig } from "@next/env";
import { updateConferenceCoverageDeliveryInDb } from "@/lib/db";
import type { ConferenceCoverageSlot } from "@/lib/types";

loadEnvConfig(process.cwd());

const slotId = process.env.COVERAGE_SLOT_ID;
const youtubeStatus = process.env.YOUTUBE_DELIVERY_STATUS as
  | ConferenceCoverageSlot["youtubeStatus"]
  | undefined;

if (!youtubeStatus) {
  throw new Error("YOUTUBE_DELIVERY_STATUS is required.");
}

await updateConferenceCoverageDeliveryInDb(slotId, {
  youtubeStatus,
  youtubeVideoId: process.env.YOUTUBE_VIDEO_ID,
  youtubeUrl: process.env.YOUTUBE_VIDEO_URL,
  workflowRunId: process.env.GITHUB_RUN_ID,
  workflowUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined,
  streamStartedAt: process.env.STREAM_STARTED_AT,
  streamEndedAt: process.env.STREAM_ENDED_AT,
  deliveryError: process.env.YOUTUBE_DELIVERY_ERROR ?? null
});

console.log(
  slotId
    ? `Updated coverage slot ${slotId} and public stream to ${youtubeStatus}.`
    : `Updated public stream to ${youtubeStatus}.`
);
