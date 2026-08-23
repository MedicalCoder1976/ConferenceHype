import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { parsePreparedStory, preparedStorySegments, storyInputSchema } from "@/lib/story/preparedStory";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    if (!env.GITHUB_DISPATCH_TOKEN) return NextResponse.json({ ok: false, error: "GITHUB_DISPATCH_TOKEN is not configured." }, { status: 503 });
    const story = parsePreparedStory(storyInputSchema.parse(await request.json()));
    const segments = preparedStorySegments(story);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_prepared_meeting_watch", {
      payload: {
        source_hash: story.sourceHash,
        source_url: story.input.sourceUrl,
        meeting_label: `Create a Story: ${story.input.topic}`,
        specialty: story.input.specialty || "Story",
        title: story.input.title,
        description: [story.input.descriptionOpening, story.input.articleTitle ? `Source: ${story.input.articleTitle}${story.input.sourceName ? ` — ${story.input.sourceName}` : ""}.` : "", story.input.authors ? `Authors: ${story.input.authors}.` : "", "", `Primary source: ${story.input.sourceUrl}`].filter(Boolean).join("\n"),
        duration_seconds: story.durationSeconds,
        starts_at: story.input.startsAt ?? new Date().toISOString(),
        segments: segments.map((segment) => ({
          title: segment.title,
          summary: segment.summary,
          script: segment.script,
          content_type: segment.contentType,
          persona_id: segment.personaId,
          persona_name: segment.personaName,
          hype_level: segment.hypeLevel,
          language: segment.language,
          citations: segment.citations,
          social_buzz_items: segment.socialBuzzItems,
          risk_flags: segment.riskFlags,
          confidence_score: segment.confidenceScore
        }))
      }
    });
    if (error) {
      throw new Error(errorMessage(error, "Supabase could not create the Story broadcast."));
    }
    const broadcast = Array.isArray(data) ? data[0] : data;
    if (!broadcast?.id) throw new Error("Story broadcast creation returned no id.");
    if (broadcast.status !== "planned") return NextResponse.json({ ok: true, alreadyExists: true, broadcast });
    await supabase.from("meeting_watch_broadcasts").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", broadcast.id);
    const dispatch = await fetch(`https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/meeting-watch-broadcast.yml/dispatches`, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "main", inputs: { meeting_watch_broadcast_id: broadcast.id } })
    });
    if (!dispatch.ok) {
      const detail = await dispatch.text();
      await supabase.from("meeting_watch_broadcasts").update({ status: "failed", failure_reason: `GitHub dispatch failed: ${dispatch.status} ${detail}` }).eq("id", broadcast.id);
      throw new Error(`GitHub workflow dispatch failed: ${dispatch.status} ${detail}`);
    }
    return NextResponse.json({ ok: true, broadcastId: broadcast.id, durationSeconds: story.durationSeconds, cardCount: story.cards.length, segmentCount: segments.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not create and dispatch the Story video."), stage: "create_broadcast" },
      { status: 400 }
    );
  }
}
