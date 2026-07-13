import { loadEnvConfig } from "@next/env";
import { verifyYoutubeDeliveryLoop } from "@/lib/media/youtubeDeliveryVerifier";

loadEnvConfig(process.cwd());

const phase = process.env.YOUTUBE_VERIFY_PHASE === "completed" ? "completed" : "live";
const youtubeVideoId = process.env.YOUTUBE_VIDEO_ID;

if (!youtubeVideoId) {
  throw new Error("YOUTUBE_VIDEO_ID is required.");
}

verifyYoutubeDeliveryLoop({
  phase,
  youtubeVideoId,
  youtubeUrl: process.env.YOUTUBE_VIDEO_URL,
  mediaPath: process.env.STREAM_VIDEO_PATH || process.env.HOUR_BROADCAST_OUTPUT,
  siteUrl: process.env.PUBLIC_SITE_URL,
  expectedPrivacyStatus:
    process.env.YOUTUBE_EXPECT_PRIVACY_STATUS === "public" ||
    process.env.YOUTUBE_EXPECT_PRIVACY_STATUS === "unlisted" ||
    process.env.YOUTUBE_EXPECT_PRIVACY_STATUS === "private"
      ? process.env.YOUTUBE_EXPECT_PRIVACY_STATUS
      : undefined,
  timeoutSeconds: process.env.YOUTUBE_VERIFY_TIMEOUT_SECONDS
    ? Number(process.env.YOUTUBE_VERIFY_TIMEOUT_SECONDS)
    : undefined,
  intervalSeconds: process.env.YOUTUBE_VERIFY_INTERVAL_SECONDS
    ? Number(process.env.YOUTUBE_VERIFY_INTERVAL_SECONDS)
    : undefined,
  skipWriteoutCheck: Boolean(process.env.JOURNAL_SLOT_ID)
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
