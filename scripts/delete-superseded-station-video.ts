import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { getYoutubeAccessToken } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

async function main() {
  const oldVideoId = process.env.OLD_YOUTUBE_VIDEO_ID;
  const replacementVideoId = process.env.REPLACEMENT_YOUTUBE_VIDEO_ID;
  const replacementProgramId = process.env.REPLACEMENT_STATION_PROGRAM_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!oldVideoId || !replacementVideoId || !replacementProgramId) throw new Error("Old video, replacement video, and replacement program IDs are required.");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase admin credentials are required.");
  if (oldVideoId === replacementVideoId) throw new Error("Refusing to delete the replacement video.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: replacement, error: replacementError } = await supabase
    .from("station_programs")
    .select("id,status,youtube_video_id,schedule_id")
    .eq("id", replacementProgramId)
    .single();
  if (replacementError) throw replacementError;
  if (replacement.status !== "verified" || replacement.youtube_video_id !== replacementVideoId) {
    throw new Error("Replacement station program is not verified against the expected video ID.");
  }

  const { data: activeReferences, error: activeError } = await supabase
    .from("station_programs")
    .select("id,station_daily_schedules!inner(status)")
    .eq("youtube_video_id", oldVideoId)
    .eq("station_daily_schedules.status", "active");
  if (activeError) throw activeError;
  if ((activeReferences ?? []).length > 0) throw new Error("Old video is still referenced by an active station schedule.");

  const { data: streamState, error: streamError } = await supabase
    .from("stream_state")
    .select("youtube_video_id")
    .eq("youtube_video_id", oldVideoId);
  if (streamError) throw streamError;
  if ((streamState ?? []).length > 0) throw new Error("Old video is still the public stream-state video.");

  const accessToken = await getYoutubeAccessToken();
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(oldVideoId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`YouTube deletion failed: ${response.status} ${await response.text()}`);
  }

  const { error: staleError } = await supabase
    .from("station_programs")
    .update({
      status: "failed",
      youtube_video_id: null,
      youtube_url: null,
      failure_reason: `Superseded by verified replacement ${replacementVideoId}; old YouTube upload deleted.`,
      updated_at: new Date().toISOString()
    })
    .eq("youtube_video_id", oldVideoId);
  if (staleError) throw staleError;
  console.log(JSON.stringify({ ok: true, deletedVideoId: oldVideoId, replacementVideoId }));
}

main().catch((error) => { console.error(error); process.exit(1); });