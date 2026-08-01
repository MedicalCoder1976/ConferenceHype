import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYoutubeAccessToken } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

const TABLES = [
  "station_programs",
  "meeting_watch_broadcasts",
  "journal_broadcast_slots",
  "conference_coverage_slots",
  "broadcast_writeouts"
] as const;

function cleanDescription(description: string) {
  return description
    .replace(/\bsource-attributed\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s+for physicians/g, " for physicians")
    .replace(/--\s*,/g, "--")
    .replace(/[ \t]+$/gm, "");
}

async function recordedVideoIds() {
  const supabase = createAdminClient();
  const ids = new Set<string>();
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("youtube_video_id").not("youtube_video_id", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data ?? []) {
      if (row.youtube_video_id) ids.add(row.youtube_video_id);
    }
  }
  return [...ids];
}

async function main() {
  const apply = process.env.APPLY_YOUTUBE_DESCRIPTION_CLEANUP === "1";
  const accessToken = await getYoutubeAccessToken();
  const channelLookup = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!channelLookup.ok) throw new Error(`YouTube channel lookup failed: ${channelLookup.status} ${await channelLookup.text()}`);
  const channelPayload = await channelLookup.json() as { items?: Array<{ id?: string }> };
  const ownedChannelIds = new Set((channelPayload.items ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)));
  const ids = await recordedVideoIds();
  const changed: Array<{ videoId: string; applied: boolean }> = [];
  const skippedNotOwned: string[] = [];
  for (const videoId of ids) {
    const lookup = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!lookup.ok) throw new Error(`YouTube metadata lookup failed for ${videoId}: ${lookup.status} ${await lookup.text()}`);
    const payload = await lookup.json() as { items?: Array<{ snippet?: Record<string, unknown> & { channelId?: string; description?: string } }> };
    const snippet = payload.items?.[0]?.snippet;
    if (!snippet) continue;
    if (!snippet.channelId || !ownedChannelIds.has(snippet.channelId)) {
      skippedNotOwned.push(videoId);
      continue;
    }
    const description = snippet.description ?? "";
    if (!/\bsource-attributed\b/i.test(description)) continue;
    const cleaned = cleanDescription(description);
    if (apply) {
      const update = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: videoId, snippet: { ...snippet, description: cleaned } })
      });
      if (!update.ok) throw new Error(`YouTube metadata update failed for ${videoId}: ${update.status} ${await update.text()}`);
    }
    changed.push({ videoId, applied: apply });
  }
  console.log(JSON.stringify({ ok: true, apply, recordedVideos: ids.length, changed: changed.length, skippedNotOwned: skippedNotOwned.length, videos: changed, skippedVideoIds: skippedNotOwned }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
