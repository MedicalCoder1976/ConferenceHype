import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYoutubeAccessToken, updateYoutubeVideoMetadata } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

// Title-only counterpart to repackage-youtube-video.ts: keeps the existing
// description, tags, category and thumbnail, and changes nothing but the title
// on YouTube and on the stored meeting_watch_broadcasts row.

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

type Snippet = { title?: string; description?: string; tags?: string[]; categoryId?: string };

async function fetchSnippet(videoId: string, accessToken: string) {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`YouTube lookup failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { items?: Array<{ snippet?: Snippet }> };
  const snippet = payload.items?.[0]?.snippet;
  if (!snippet) throw new Error(`YouTube video ${videoId} was not found.`);
  return snippet;
}

async function main() {
  const videoId = required("YOUTUBE_VIDEO_ID");
  const title = required("YOUTUBE_TITLE").replace(/\s+/g, " ");
  if (Array.from(title).length > 100) throw new Error(`Title is ${Array.from(title).length} characters; YouTube allows 100.`);

  const accessToken = await getYoutubeAccessToken();
  const before = await fetchSnippet(videoId, accessToken);
  await updateYoutubeVideoMetadata({
    videoId,
    accessToken,
    title,
    description: before.description ?? "",
    tags: before.tags ?? [],
    categoryId: before.categoryId ?? "27"
  });
  // The Data API read-back lags the update by a few seconds (the first run
  // reported the old title although the public page already had the new one).
  let after = await fetchSnippet(videoId, accessToken);
  for (let attempt = 0; attempt < 6 && after.title !== title; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    after = await fetchSnippet(videoId, accessToken);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("meeting_watch_broadcasts")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("youtube_video_id", videoId)
    .select("id");
  if (error) throw error;

  console.log(JSON.stringify({ ok: after.title === title, videoId, oldTitle: before.title, newTitle: after.title, storedRows: data?.length ?? 0 }, null, 2));
  if (after.title !== title) throw new Error("YouTube did not report the new title.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
