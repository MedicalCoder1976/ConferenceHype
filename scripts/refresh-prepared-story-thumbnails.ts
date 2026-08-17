import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function concise(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const prefix = normalized.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.65 ? boundary : undefined).trim()}…`;
}

async function main() {
  const [db, supabaseAdmin, meetingWatchMetadata, youtube] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/supabase/admin"),
    import("@/lib/youtube/meetingWatchMetadata"),
    import("@/lib/youtube/uploadBroadcastVideo")
  ]);
  const { getSegmentsByIdsFromDb } = db;
  const { createAdminClient } = supabaseAdmin;
  const { buildMeetingWatchMetadata } = meetingWatchMetadata;
  const { downloadYoutubeThumbnail, getYoutubeAccessToken, uploadYoutubeThumbnail } = youtube;
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("meeting_watch_broadcasts")
    .select("id,title,meeting_label,specialty,source_url,description,starts_at,youtube_video_id,card_ids")
    .eq("prepared_narrative", true)
    .eq("status", "verified")
    .not("youtube_video_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const accessToken = apply ? await getYoutubeAccessToken() : "";
  const refreshed = [];
  for (const broadcast of data ?? []) {
    const segments = await getSegmentsByIdsFromDb(broadcast.card_ids ?? []);
    const affected = segments.filter((segment) => segment.riskFlags.some((flag) => /^prepared_thumbnail:What Changed\b/i.test(flag)));
    if (!affected.length) continue;

    const hourStart = new Date(broadcast.starts_at);
    const slots = segments.map((segment, index) => ({
      at: new Date(hourStart.getTime() + index * 150_000),
      kind: "schedule" as const,
      durationMinutes: 2.5,
      durationSeconds: 150,
      segment,
      label: segment.title
    }));
    const metadata = buildMeetingWatchMetadata({
      hourStart,
      slots,
      title: broadcast.title,
      meetingLabel: broadcast.meeting_label,
      specialty: broadcast.specialty ?? undefined,
      sourceUrl: broadcast.source_url,
      descriptionOpening: broadcast.description?.split("\n")[0]
    });
    const headline = concise(broadcast.title, 58);
    if (apply) {
      const thumbnailSpec = {
        tier: metadata.tier,
        specialty: metadata.specialty,
        dateLabel: metadata.dateLabel,
        headline,
        topicLabel: metadata.clinicalTopic,
        entityLabel: metadata.thumbnailEntity,
        seriesLabel: "CLINICAL EVIDENCE BRIEF",
        panelLabel: `${(metadata.specialty ?? "MEETING").toUpperCase()} HIGHLIGHTS`,
        promiseLabel: "THE STORY BEHIND THE RESULT",
        siteUrl: process.env.PUBLIC_SITE_URL
      };
      const thumbnailBytes = await downloadYoutubeThumbnail(thumbnailSpec);
      await uploadYoutubeThumbnail({ videoId: broadcast.youtube_video_id!, accessToken, thumbnailBytes, ...thumbnailSpec });
      for (const segment of affected) {
        const riskFlags = segment.riskFlags.map((flag) => flag.startsWith("prepared_thumbnail:") ? `prepared_thumbnail:${headline}` : flag);
        const { error: updateError } = await supabase.from("segments").update({ risk_flags: riskFlags }).eq("id", segment.id);
        if (updateError) throw updateError;
      }
    }
    refreshed.push({ videoId: broadcast.youtube_video_id, title: broadcast.title, headline, applied: apply });
  }
  console.log(JSON.stringify({ ok: true, apply, refreshed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
