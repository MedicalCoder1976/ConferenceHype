import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const expectedVideoId = process.env.YOUTUBE_VIDEO_ID;
  const { data: streamState, error: streamError } = await supabase
    .from("stream_state")
    .select("youtube_video_id,youtube_status,youtube_url,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (streamError) {
    throw streamError;
  }

  const publicVideoId = expectedVideoId || streamState?.youtube_video_id;
  if (!publicVideoId) {
    throw new Error("No YouTube video ID is available for public alignment verification.");
  }

  const { data: writeout, error: writeoutError } = await supabase
    .from("broadcast_writeouts")
    .select("id,title,status,youtube_video_id,cards,updated_at")
    .eq("youtube_video_id", publicVideoId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (writeoutError) {
    throw writeoutError;
  }
  if (!writeout) {
    throw new Error(
      `Public stream video ${publicVideoId} does not have a matching broadcast_writeouts record.`
    );
  }

  const cards = Array.isArray(writeout.cards) ? writeout.cards : [];
  const contentCards = cards.filter((card) => card?.kind === "content");
  if (contentCards.length === 0) {
    throw new Error(`Writeout ${writeout.id} for video ${publicVideoId} has no content cards.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        publicVideoId,
        streamStatus: streamState?.youtube_status,
        writeoutId: writeout.id,
        writeoutStatus: writeout.status,
        contentCards: contentCards.length,
        firstCard: contentCards[0]?.title
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
