import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Cleans up a YouTube live broadcast that a failed workflow run created but
// never actually streamed to -- otherwise it sits on the channel forever as
// a phantom "Upcoming" stream that will never start (confirmed live: video
// EZ0y3lABauY, orphaned by the broadcast_writeouts alignment-check failure
// before that bug was fixed). Sets it to private rather than deleting it --
// reversible, and doesn't destroy anything if this run turns out to have
// aired real content after all.
//
// Only proceeds when we can confirm this run's stream never went live; if
// stream_started_at is set, real content may have aired, so this bails out
// and leaves it for manual review instead of hiding published content.
async function main() {
  const videoId = process.env.YOUTUBE_VIDEO_ID;
  const coverageSlotId = process.env.COVERAGE_SLOT_ID;
  const journalSlotId = process.env.JOURNAL_SLOT_ID;
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!videoId) {
    console.log("No YouTube video ID to clean up.");
    return;
  }
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing YouTube OAuth credentials.");
  }

  if (!process.env.SKIP_STREAM_STARTED_CHECK) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase admin environment variables.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const table = journalSlotId ? "journal_broadcast_slots" : "conference_coverage_slots";
    const slotId = journalSlotId || coverageSlotId;
    if (slotId) {
      const { data: slot, error } = await supabase
        .from(table)
        .select("stream_started_at,youtube_video_id")
        .eq("id", slotId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (slot?.youtube_video_id !== videoId) {
        console.log(
          `Slot ${slotId} now points at a different video (${slot?.youtube_video_id ?? "none"}); skipping cleanup of ${videoId} to avoid touching an unrelated broadcast.`
        );
        return;
      }
      if (slot?.stream_started_at) {
        console.log(
          `Video ${videoId} has stream_started_at=${slot.stream_started_at} -- it may have aired real content, so it will not be auto-hidden. Review manually.`
        );
        return;
      }
    }
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!tokenResponse.ok) {
    throw new Error(`YouTube OAuth refresh failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

  const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: videoId,
      status: { privacyStatus: "private" }
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to set video ${videoId} private: ${response.status} ${await response.text()}`);
  }
  console.log(JSON.stringify({ ok: true, videoId, privacyStatus: "private" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
