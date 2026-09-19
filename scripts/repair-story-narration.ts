import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { parsePreparedStory, preparedStorySegments } from "@/lib/story/preparedStory";
import { assertCleanNarration } from "@/lib/media/narrationText";

loadEnvConfig(process.cwd());
async function main() {
  const id = process.env.MEETING_WATCH_BROADCAST_ID;
  if (!id || process.env.YOUTUBE_PRIVACY_STATUS !== "private") throw new Error("Repair requires an explicit broadcast ID and private rendering.");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data: broadcast, error } = await db.from("meeting_watch_broadcasts").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: rows, error: segmentError } = await db.from("segments").select("*").in("id", broadcast.card_ids);
  if (segmentError) throw segmentError;
  const ordered = broadcast.card_ids.map((cardId: string) => rows.find(row => row.id === cardId));
  if (ordered.some((row: any) => !row?.risk_flags?.includes("prepared_story"))) throw new Error("Repair supports complete prepared Story records only.");
  await mkdir("public/rendered/story-repair", { recursive: true });
  await writeFile("public/rendered/story-repair/before.json", JSON.stringify({ broadcast, segments: ordered }, null, 2));
  const narrative = ordered.filter((row: any) => !row.risk_flags.includes("prepared_disclaimer") && !row.risk_flags.includes("prepared_closing")).map((row: any) => row.script).join(" ");
  const closing = ordered.find((row: any) => row.risk_flags.includes("prepared_closing"));
  const topic = closing?.script.match(/^That is the story of (.*?)\. Add your perspective/)?.[1] ?? broadcast.title;
  const thumbnail = ordered[0].risk_flags.find((flag: string) => flag.startsWith("prepared_thumbnail:"))?.slice("prepared_thumbnail:".length) ?? broadcast.title.slice(0, 58);
  const story = parsePreparedStory({title: broadcast.title, topic, sourceUrl: broadcast.source_url, sourceName: "", articleTitle: broadcast.title, authors: "", specialty: broadcast.specialty, descriptionOpening: broadcast.description.slice(0, 500), thumbnailHeadline: thumbnail, narrative});
  const repaired = preparedStorySegments(story);
  if (repaired.length !== ordered.length) throw new Error("Unexpected card count; refusing partial repair.");
  const updated = repaired.map((segment, index) => {
    assertCleanNarration(segment.script);
    return { ...ordered[index], title: segment.title, script: segment.script, summary: segment.summary, risk_flags: segment.riskFlags, updated_at: new Date().toISOString() };
  });
  const { error: updateError } = await db.from("segments").upsert(updated);
  if (updateError) throw updateError;
  const { error: broadcastError } = await db.from("meeting_watch_broadcasts").update({duration_seconds: story.durationSeconds, source_hash: story.sourceHash, updated_at: new Date().toISOString()}).eq("id", id);
  if (broadcastError) throw broadcastError;
  await writeFile("public/rendered/story-repair/after.json", JSON.stringify({broadcastId: id, previousVideoId: broadcast.youtube_video_id, spokenWords: story.spokenWords, segments: updated}, null, 2));
  console.log(JSON.stringify({broadcastId: id, repairedCards: updated.length, spokenWords: story.spokenWords}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
