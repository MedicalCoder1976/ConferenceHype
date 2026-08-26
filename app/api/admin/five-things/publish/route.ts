import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { fiveThingsInputSchema, parsePreparedFiveThings, preparedFiveThingsSegments } from "@/lib/story/preparedFiveThings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    if (!env.GITHUB_DISPATCH_TOKEN) return NextResponse.json({ ok: false, error: "GITHUB_DISPATCH_TOKEN is not configured." }, { status: 503 });
    const prepared = parsePreparedFiveThings(fiveThingsInputSchema.parse(await request.json()));
    const segments = preparedFiveThingsSegments(prepared);
    const sources = prepared.items.map((item) => item.sourceUrl);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_prepared_meeting_watch", {
      payload: {
        source_hash: prepared.sourceHash,
        source_url: sources[0],
        meeting_label: `5 Things to Know: ${prepared.input.specialty}`,
        specialty: prepared.input.specialty,
        title: prepared.title,
        description: [
          `Five ${prepared.input.specialty.toLowerCase()} developments physicians should know today.`,
          "",
          ...prepared.items.map((item) => `${item.position}. ${item.title}\nPrimary source: ${item.sourceUrl}`)
        ].join("\n"),
        duration_seconds: prepared.durationSeconds,
        starts_at: prepared.input.startsAt ?? new Date().toISOString(),
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
    if (error) throw new Error(errorMessage(error, "Supabase could not create the 5 Things to Know broadcast."));
    const broadcast = Array.isArray(data) ? data[0] : data;
    if (!broadcast?.id) throw new Error("5 Things to Know broadcast creation returned no id.");
    if (broadcast.status !== "planned") return NextResponse.json({ ok: true, alreadyExists: true, broadcast, title: prepared.title });
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
    return NextResponse.json({ ok: true, broadcastId: broadcast.id, title: prepared.title, durationSeconds: prepared.durationSeconds, itemCount: prepared.items.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error, "Could not create and dispatch the 5 Things to Know video."), stage: "create_broadcast" }, { status: 400 });
  }
}
