import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.string().uuid();

async function publicYoutubeReachable(videoId?: string | null) {
  if (!videoId) return false;
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  }).catch(() => undefined);
  return response?.ok === true;
}

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const broadcastId = querySchema.parse(request.nextUrl.searchParams.get("broadcastId"));
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("meeting_watch_broadcasts")
      .select("id,title,status,youtube_video_id,youtube_url,failure_reason")
      .eq("id", broadcastId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "Story delivery was not found." }, { status: 404 });
    const publicReachable = data.status === "verified" && await publicYoutubeReachable(data.youtube_video_id);
    return NextResponse.json({
      ok: true,
      delivery: {
        status: data.status,
        title: data.title,
        youtubeVideoId: data.youtube_video_id,
        youtubeUrl: data.youtube_url,
        publicReachable,
        failureReason: data.failure_reason
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
