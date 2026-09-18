import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { repackageFiveThingsDescription } from "@/lib/youtube/repackageFiveThings";
import { FIVE_THINGS_SPECIALTIES } from "@/lib/story/fiveThingsConfig";
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
  const fiveThings = process.env.THUMBNAIL_FIVE_THINGS === "true";
  const specialty = fiveThings ? required("THUMBNAIL_SPECIALTY") : process.env.THUMBNAIL_SPECIALTY || "Obesity Medicine";
  if (fiveThings && !FIVE_THINGS_SPECIALTIES.some((value) => value === specialty)) throw new Error("Unknown Five Things specialty.");
  const supabase = createAdminClient();
  const { data: broadcast, error: lookupError } = await supabase.from("meeting_watch_broadcasts")
    .select("id,specialty,meeting_label").eq("youtube_video_id", videoId).single();
  if (lookupError) throw lookupError;
  if (fiveThings && !broadcast.meeting_label.startsWith("5 Things to Know:")) throw new Error("Selected video is not a Five Things broadcast.");
  const accessToken = await getYoutubeAccessToken();
  const lookup = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!lookup.ok) throw new Error(`YouTube lookup failed: ${lookup.status} ${await lookup.text()}`);
  const payload = await lookup.json() as { items?: Array<{ snippet?: { description?: string; tags?: string[]; categoryId?: string } }> };
  const snippet = payload.items?.[0]?.snippet;
  if (!snippet) throw new Error(`YouTube video ${videoId} was not found.`);
  const cleanedDescription = removeViewerGroundingLabels(snippet.description ?? "");
  const description = fiveThings ? repackageFiveThingsDescription(cleanedDescription, specialty, broadcast.specialty ?? "") : cleanedDescription;
  const tags = fiveThings ? [...new Set((snippet.tags ?? []).map((tag) => tag.toLowerCase() === broadcast.specialty?.toLowerCase() ? specialty : tag))] : snippet.tags ?? [];
  await updateYoutubeVideoMetadata({
    videoId,
    accessToken,
    title,
    description,
    tags,
    categoryId: snippet.categoryId ?? "27"
  });
  const thumbnailSpec = {
    fiveThings,
    tier: "generic",
    specialty,
    dateLabel: fiveThings ? "" : process.env.THUMBNAIL_DATE || "Aug 1, 2026",
    headline: fiveThings ? title : required("THUMBNAIL_HEADLINE"),
    topicLabel: required("THUMBNAIL_TOPIC"),
    entityLabel: required("THUMBNAIL_ENTITY"),
    seriesLabel: process.env.THUMBNAIL_SERIES || "THE RETATRUTIDE STORY",
    panelLabel: process.env.THUMBNAIL_PANEL || "STORY HIGHLIGHTS",
    promiseLabel: process.env.THUMBNAIL_PROMISE || "HOW A TRIPLE AGONIST GOT HERE",
    siteUrl: process.env.PUBLIC_SITE_URL
  };
  const thumbnailBytes = await downloadYoutubeThumbnail(thumbnailSpec);
  await uploadYoutubeThumbnail({ videoId, accessToken, thumbnailBytes, ...thumbnailSpec });

  const { error } = await supabase
    .from("meeting_watch_broadcasts")
    .update({ title, description, ...(fiveThings ? { specialty, meeting_label: `5 Things to Know: ${specialty}` } : {}), updated_at: new Date().toISOString() })
    .eq("youtube_video_id", videoId);
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, videoId, title, thumbnail: thumbnailSpec }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
