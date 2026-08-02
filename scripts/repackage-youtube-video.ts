import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  downloadYoutubeThumbnail,
  getYoutubeAccessToken,
  removeViewerGroundingLabels,
  updateYoutubeVideoMetadata,
  uploadYoutubeThumbnail
} from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const videoId = required("YOUTUBE_VIDEO_ID");
  const title = required("YOUTUBE_TITLE");
  const accessToken = await getYoutubeAccessToken();
  const lookup = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!lookup.ok) throw new Error(`YouTube lookup failed: ${lookup.status} ${await lookup.text()}`);
  const payload = await lookup.json() as { items?: Array<{ snippet?: { description?: string; tags?: string[]; categoryId?: string } }> };
  const snippet = payload.items?.[0]?.snippet;
  if (!snippet) throw new Error(`YouTube video ${videoId} was not found.`);
  const description = removeViewerGroundingLabels(snippet.description ?? "");
  await updateYoutubeVideoMetadata({
    videoId,
    accessToken,
    title,
    description,
    tags: snippet.tags ?? [],
    categoryId: snippet.categoryId ?? "27"
  });
  const thumbnailSpec = {
    tier: "generic",
    specialty: process.env.THUMBNAIL_SPECIALTY || "Obesity Medicine",
    dateLabel: process.env.THUMBNAIL_DATE || "Aug 1, 2026",
    headline: required("THUMBNAIL_HEADLINE"),
    topicLabel: required("THUMBNAIL_TOPIC"),
    entityLabel: required("THUMBNAIL_ENTITY"),
    seriesLabel: process.env.THUMBNAIL_SERIES || "THE RETATRUTIDE STORY",
    panelLabel: process.env.THUMBNAIL_PANEL || "STORY HIGHLIGHTS",
    promiseLabel: process.env.THUMBNAIL_PROMISE || "HOW A TRIPLE AGONIST GOT HERE",
    siteUrl: process.env.PUBLIC_SITE_URL
  };
  const thumbnailBytes = await downloadYoutubeThumbnail(thumbnailSpec);
  await uploadYoutubeThumbnail({ videoId, accessToken, thumbnailBytes, ...thumbnailSpec });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meeting_watch_broadcasts")
    .update({ title, description, updated_at: new Date().toISOString() })
    .eq("youtube_video_id", videoId);
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, videoId, title, thumbnail: thumbnailSpec }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
