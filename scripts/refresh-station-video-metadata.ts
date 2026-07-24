import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOncologyJournalsFromDb, getSegmentsByIdsFromDb } from "@/lib/db";
import { getActiveStationScheduleFromDb } from "@/lib/station/db";
import { buildBroadcastMetadata } from "@/lib/youtube/broadcastMetadata";
import { getYoutubeAccessToken, updateYoutubeVideoMetadata, uploadYoutubeThumbnail } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function main() {
  const targetDate = process.env.STATION_METADATA_DATE || easternDate();
  if (targetDate < "2026-07-24") {
    console.log(JSON.stringify({ ok: true, skipped: true, targetDate, reason: "Optimization starts 2026-07-24" }));
    return;
  }
  const schedule = await getActiveStationScheduleFromDb(targetDate);
  if (!schedule) throw new Error(`No active station schedule exists for ${targetDate}.`);
  const journals = (await getOncologyJournalsFromDb()) ?? [];
  const journalsById = new Map(journals.map((journal) => [journal.id, journal]));
  const accessToken = await getYoutubeAccessToken();
  const supabase = createAdminClient();
  const results: Array<{ position: number; videoId: string; title: string; studyNames: string[] }> = [];

  for (const program of schedule.programs) {
    if (program.status !== "verified" || !program.youtubeVideoId || !program.cardIds.length) {
      throw new Error(`Station position ${program.position} is not a refreshable verified program.`);
    }
    const segments = await getSegmentsByIdsFromDb(program.cardIds);
    const { data: articleRows, error: articleError } = await supabase
      .from("journal_articles")
      .select("card_segment_id,abstract_text")
      .in("card_segment_id", program.cardIds);
    if (articleError) throw articleError;
    const studySourceTextBySegmentId = new Map((articleRows ?? []).map((row) => [row.card_segment_id, row.abstract_text ?? ""]));
    const ordered = program.cardIds.map((id) => segments.find((segment) => segment.id === id)).filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
    if (!ordered.length) throw new Error(`Station position ${program.position} has no resolvable cards.`);
    const hourStart = new Date(`${targetDate}T12:00:00Z`);
    const slots = ordered.map((segment, index) => ({
      at: new Date(hourStart.getTime() + index * 150_000),
      kind: "schedule" as const,
      durationMinutes: 2.5,
      durationSeconds: 150,
      segment,
      label: segment.title
    }));
    const published = ordered.map((segment) => segment.citations?.[0]?.publishedAt).filter((value): value is string => Boolean(value));
    const metadata = buildBroadcastMetadata({ hourStart, slots, journalsById, titleDateOverride: published[0], studySourceTextBySegmentId });
    await updateYoutubeVideoMetadata({
      videoId: program.youtubeVideoId,
      accessToken,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId
    });
    await uploadYoutubeThumbnail({
      videoId: program.youtubeVideoId,
      accessToken,
      tier: metadata.tier,
      journalName: metadata.journalName,
      specialty: metadata.specialty,
      dateLabel: metadata.dateLabel,
      headline: metadata.thumbnailHeadline,
      siteUrl: process.env.PUBLIC_SITE_URL
    });
    const { error } = await supabase.from("station_programs").update({
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      updated_at: new Date().toISOString()
    }).eq("id", program.id);
    if (error) throw error;
    results.push({ position: program.position, videoId: program.youtubeVideoId, title: metadata.title, studyNames: metadata.studyNames });
  }
  console.log(JSON.stringify({ ok: true, targetDate, refreshed: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
