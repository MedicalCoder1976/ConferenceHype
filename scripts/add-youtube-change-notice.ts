import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Backfill (2026-11-06): add the "Information can change" notice to the
// descriptions of recently published site videos. New uploads get it from
// normalizeYoutubeDescription; this only touches videos published in the last
// NOTICE_DAYS days (default 14) to keep YouTube quota use small (~51 units per
// changed video). Dry run unless APPLY_YOUTUBE_CHANGE_NOTICE=1.
async function main() {
  const { loadConferences } = await import("@/lib/conferences/hub");
  const { getYoutubeAccessToken, YOUTUBE_CHANGE_NOTICE } = await import("@/lib/youtube/uploadBroadcastVideo");
  const apply = process.env.APPLY_YOUTUBE_CHANGE_NOTICE === "1";
  const days = Number(process.env.NOTICE_DAYS ?? 14);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const conferences = await loadConferences();
  const recent = conferences
    .flatMap((conference) => conference.videos.map((video) => ({ ...video, conference: conference.displayName })))
    .filter((video) => new Date(video.publishedAt).getTime() >= cutoff);
  const ids = [...new Set(recent.map((video) => video.videoId))];

  const accessToken = await getYoutubeAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const channelLookup = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers });
  if (!channelLookup.ok) throw new Error(`YouTube channel lookup failed: ${channelLookup.status}`);
  const ownedChannelIds = new Set(((await channelLookup.json()) as { items?: Array<{ id?: string }> }).items?.map((item) => item.id));

  const results: Array<{ videoId: string; title: string; action: string }> = [];
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const lookup = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(",")}`, { headers });
    if (!lookup.ok) throw new Error(`YouTube lookup failed: ${lookup.status} ${await lookup.text()}`);
    const items = ((await lookup.json()) as { items?: Array<{ id: string; snippet?: Record<string, unknown> & { channelId?: string; description?: string; title?: string } }> }).items ?? [];
    for (const item of items) {
      const snippet = item.snippet;
      const title = String(snippet?.title ?? "");
      if (!snippet || !ownedChannelIds.has(snippet.channelId)) {
        results.push({ videoId: item.id, title, action: "skipped: not owned" });
        continue;
      }
      const description = snippet.description ?? "";
      if (description.includes(YOUTUBE_CHANGE_NOTICE)) {
        results.push({ videoId: item.id, title, action: "already has notice" });
        continue;
      }
      const updated = `${description.trimEnd()}\n\n${YOUTUBE_CHANGE_NOTICE}`;
      if (new TextEncoder().encode(updated).length > 5000) {
        results.push({ videoId: item.id, title, action: "skipped: would exceed 5000 bytes" });
        continue;
      }
      if (apply) {
        const update = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, snippet: { ...snippet, description: updated } })
        });
        if (!update.ok) {
          results.push({ videoId: item.id, title, action: `failed: ${update.status}` });
          continue;
        }
      }
      results.push({ videoId: item.id, title, action: apply ? "updated" : "would update" });
    }
  }
  for (const result of results) console.log(`${result.action.padEnd(34)} ${result.videoId}  ${result.title}`);
  console.log(JSON.stringify({ apply, days, recentVideos: ids.length, counts: results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.action]: (acc[r.action] ?? 0) + 1 }), {}) }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
