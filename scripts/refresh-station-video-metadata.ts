import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOncologyJournalsFromDb, getSegmentsByIdsFromDb } from "@/lib/db";
import { getActiveStationScheduleFromDb, getStationSchedulesFromDb } from "@/lib/station/db";
import { assertSearchOptimizedBroadcastMetadata, buildBroadcastMetadata } from "@/lib/youtube/broadcastMetadata";
import { buildJournalClubYoutubeTitle } from "@/lib/youtube/clinicalEvidencePackaging";
import { getYoutubeAccessToken, updateYoutubeVideoMetadata, uploadYoutubeThumbnail } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function main() {
  const targetDate = process.env.STATION_METADATA_DATE || easternDate();
  const refreshAllReleased = process.env.STATION_METADATA_ALL_RELEASED === "1";
  const dryRun = process.env.STATION_METADATA_DRY_RUN === "1";
  const titleOverride = process.env.STATION_TITLE_OVERRIDE?.trim();
  const thumbnailHeadlineOverride = process.env.STATION_THUMBNAIL_HEADLINE_OVERRIDE?.trim();
  if (targetDate < "2026-07-24") {
    console.log(JSON.stringify({ ok: true, skipped: true, targetDate, reason: "Optimization starts 2026-07-24" }));
    return;
  }
  const schedule = refreshAllReleased
    ? undefined
    : (await getActiveStationScheduleFromDb(targetDate)) ?? ((await getStationSchedulesFromDb(60)) ?? []).find((candidate) => candidate.scheduleDate === targetDate);
  if (!refreshAllReleased && !schedule) throw new Error(`No station schedule exists for ${targetDate}.`);
  const schedules = refreshAllReleased
    ? ((await getStationSchedulesFromDb(60)) ?? []).filter((candidate) => candidate.scheduleDate <= targetDate)
    : [schedule!];
  const journals = (await getOncologyJournalsFromDb()) ?? [];
  const journalsById = new Map(journals.map((journal) => [journal.id, journal]));
  const accessToken = dryRun ? "" : await getYoutubeAccessToken();
  const supabase = createAdminClient();
  const results: Array<{ scheduleDate: string; position: number; videoId: string; title: string; studyNames: string[] }> = [];
  const refreshedVideoIds = new Set<string>();

  for (const selectedSchedule of schedules) {
    for (const program of selectedSchedule.programs) {
      if (program.status !== "verified" || !program.youtubeVideoId || !program.cardIds.length || refreshedVideoIds.has(program.youtubeVideoId)) continue;
      refreshedVideoIds.add(program.youtubeVideoId);
    const segments = await getSegmentsByIdsFromDb(program.cardIds);
    const { data: articleRows, error: articleError } = await supabase
      .from("journal_articles")
      .select("card_segment_id,abstract_text")
      .in("card_segment_id", program.cardIds);
    if (articleError) throw articleError;
    const studySourceTextBySegmentId = new Map((articleRows ?? []).map((row) => [row.card_segment_id, row.abstract_text ?? ""]));
    const ordered = program.cardIds.map((id) => segments.find((segment) => segment.id === id)).filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
    if (!ordered.length) throw new Error(`Station position ${program.position} has no resolvable cards.`);
    const hourStart = new Date(`${selectedSchedule.scheduleDate}T12:00:00Z`);
    const slots = ordered.map((segment, index) => ({
      at: new Date(hourStart.getTime() + index * 150_000),
      kind: "schedule" as const,
      durationMinutes: 2.5,
      durationSeconds: 150,
      segment,
      label: segment.title
    }));
    const published = ordered.map((segment) => segment.citations?.[0]?.publishedAt).filter((value): value is string => Boolean(value));
    const metadata = assertSearchOptimizedBroadcastMetadata(
      buildBroadcastMetadata({ hourStart, slots, journalsById, titleDateOverride: published[0], studySourceTextBySegmentId }),
      { requireJournalContext: true }
    );
    const isJournalClub = selectedSchedule.programs.some((candidate) =>
      candidate.youtubeVideoId === program.youtubeVideoId && candidate.programType === "new"
    );
    const resolvedTitle = titleOverride || (isJournalClub
      ? buildJournalClubYoutubeTitle(metadata.title, metadata.specialty)
      : metadata.title);
    if (!dryRun) await updateYoutubeVideoMetadata({
      videoId: program.youtubeVideoId,
      accessToken,
      title: resolvedTitle,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId
    });
    if (!dryRun) await uploadYoutubeThumbnail({
      videoId: program.youtubeVideoId,
      accessToken,
      tier: metadata.tier,
      journalName: metadata.journalName,
      specialty: metadata.specialty,
      dateLabel: metadata.dateLabel,
      headline: thumbnailHeadlineOverride || metadata.thumbnailHeadline,
      topicLabel: metadata.clinicalTopic,
      entityLabel: metadata.thumbnailEntity,
      journalNames: metadata.thumbnailJournalNames,
      journalCount: metadata.thumbnailJournalCount,
      journalClub: isJournalClub && Boolean(metadata.journalName),
      articleTitle: metadata.thumbnailArticleTitle,
      siteUrl: process.env.PUBLIC_SITE_URL
    });
    const { error } = dryRun ? { error: null } : await supabase.from("station_programs").update({
      title: resolvedTitle,
      description: metadata.description,
      tags: metadata.tags,
      updated_at: new Date().toISOString()
    }).eq("id", program.id);
    if (error) throw error;
      results.push({ scheduleDate: selectedSchedule.scheduleDate, position: program.position, videoId: program.youtubeVideoId, title: resolvedTitle, studyNames: metadata.studyNames });
    }
  }
  if (!results.length) throw new Error(`No refreshable verified journal videos were found through ${targetDate}.`);
  console.log(JSON.stringify({ ok: true, targetDate, refreshAllReleased, dryRun, refreshed: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
