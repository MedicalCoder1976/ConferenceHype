import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StationBreakIn, StationProgram } from "@/lib/station/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateStationBreakInDeliveryInDb(
  id: string,
  patch: {
    status: StationBreakIn["status"];
    youtubeVideoId?: string;
    youtubeUrl?: string;
    failureReason?: string | null;
  }
) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("station_breakins")
    .update({
      status: patch.status,
      youtube_video_id: patch.youtubeVideoId ?? undefined,
      youtube_url: patch.youtubeUrl ?? undefined,
      failure_reason: patch.failureReason ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateStationProgramDeliveryInDb(
  id: string,
  patch: {
    status: StationProgram["status"];
    youtubeVideoId?: string;
    youtubeUrl?: string;
    title?: string;
    description?: string;
    cardIds?: string[];
    writeoutCards?: StationProgram["writeoutCards"];
    failureReason?: string | null;
  }
) {
  if (!hasSupabase()) return null;
  // card_ids is a Postgres uuid[] column, while the rendered rundown also
  // contains synthetic disclaimer/music/spine ids. Preserve those synthetic
  // entries in writeout_cards, but never send them to the uuid[] column.
  const persistedCardIds = patch.cardIds?.filter((cardId) => UUID_PATTERN.test(cardId));
  const { data, error } = await createAdminClient()
    .from("station_programs")
    .update({
      status: patch.status,
      youtube_video_id: patch.youtubeVideoId ?? undefined,
      youtube_url: patch.youtubeUrl ?? undefined,
      title: patch.title ?? undefined,
      description: patch.description ?? undefined,
      card_ids: persistedCardIds ?? undefined,
      writeout_cards: patch.writeoutCards ?? undefined,
      failure_reason: patch.failureReason ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
