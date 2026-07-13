import { loadEnvConfig } from "@next/env";
import { updateConferenceCoverageDeliveryInDb, updateJournalBroadcastDeliveryInDb } from "@/lib/db";
import type { ConferenceCoverageSlot } from "@/lib/types";

loadEnvConfig(process.cwd());

async function main() {
const slotId = process.env.COVERAGE_SLOT_ID;
const journalSlotId = process.env.JOURNAL_SLOT_ID;
const youtubeStatus = process.env.YOUTUBE_DELIVERY_STATUS as
  | ConferenceCoverageSlot["youtubeStatus"]
  | undefined;

if (!youtubeStatus) {
  throw new Error("YOUTUBE_DELIVERY_STATUS is required.");
}

const patch = {
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
};

// Only one of these is ever set per run -- a journal-show slot and a
// conference slot never share a workflow run.
if (journalSlotId) {
  await updateJournalBroadcastDeliveryInDb(journalSlotId, patch);
} else {
  await updateConferenceCoverageDeliveryInDb(slotId, patch);
}

console.log(
  journalSlotId
    ? `Updated journal broadcast slot ${journalSlotId} and public stream to ${youtubeStatus}.`
    : slotId
      ? `Updated coverage slot ${slotId} and public stream to ${youtubeStatus}.`
      : `Updated public stream to ${youtubeStatus}.`
);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
