import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type MeetingWatchBroadcast = {
  id: string;
  sourceUrl: string;
  meetingLabel: string;
  specialty?: string;
  episodeIndex: number;
  episodeCount: number;
  title: string;
  description: string;
  cardIds: string[];
  status: "planned" | "rendering" | "uploaded" | "verified" | "failed";
  startsAt: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  failureReason?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  source_url: string;
  meeting_label: string;
  specialty?: string | null;
  episode_index: number;
  episode_count: number;
  title: string;
  description: string;
  card_ids?: string[] | null;
  status: MeetingWatchBroadcast["status"];
  starts_at: string;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  failure_reason?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

function toBroadcast(row: Row): MeetingWatchBroadcast {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    meetingLabel: row.meeting_label,
    specialty: row.specialty ?? undefined,
    episodeIndex: row.episode_index,
    episodeCount: row.episode_count,
    title: row.title,
    description: row.description,
    cardIds: row.card_ids ?? [],
    status: row.status,
    startsAt: row.starts_at,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getMeetingWatchBroadcastFromDb(id: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("meeting_watch_broadcasts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toBroadcast(data as Row) : null;
}

export async function getMeetingWatchBroadcastsFromDb(limit = 50) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("meeting_watch_broadcasts")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toBroadcast);
}

// Polled by meeting-watch-broadcast.yml -- same bounded-window pattern as
// youtube-stream.yml's conference_coverage_slots poll (GH Actions runners
// can be delayed under load, so an exact-second match would silently miss
// due broadcasts).
export async function getDueMeetingWatchBroadcastsFromDb(from: string, to: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("meeting_watch_broadcasts")
    .select("*")
    .eq("status", "planned")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toBroadcast);
}

export async function createMeetingWatchBroadcastInDb(input: {
  sourceUrl: string;
  meetingLabel: string;
  specialty?: string;
  episodeIndex: number;
  episodeCount: number;
  title: string;
  description: string;
  cardIds: string[];
  startsAt: string;
}) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("meeting_watch_broadcasts")
    .upsert(
      {
        source_url: input.sourceUrl,
        meeting_label: input.meetingLabel,
        specialty: input.specialty ?? null,
        episode_index: input.episodeIndex,
        episode_count: input.episodeCount,
        title: input.title,
        description: input.description,
        card_ids: input.cardIds,
        status: "planned",
        starts_at: input.startsAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: "source_url,episode_index" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return toBroadcast(data as Row);
}

export async function updateMeetingWatchBroadcastDeliveryInDb(
  id: string,
  patch: {
    status: MeetingWatchBroadcast["status"];
    youtubeVideoId?: string;
    youtubeUrl?: string;
    failureReason?: string | null;
  }
) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("meeting_watch_broadcasts")
    .update({
      status: patch.status,
      youtube_video_id: patch.youtubeVideoId,
      youtube_url: patch.youtubeUrl,
      failure_reason: patch.failureReason ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toBroadcast(data as Row);
}
