import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { parsePreparedNarrative, preparedNarrativeSegments } from "@/lib/meetingWatch/preparedNarrative";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ raw: z.string().min(2_000).max(500_000), title: z.string().trim().min(10).max(150), thumbnailStatement: z.string().trim().min(8).max(120) });
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    if (!env.GITHUB_DISPATCH_TOKEN) return NextResponse.json({ ok: false, error: "GITHUB_DISPATCH_TOKEN is not configured." }, { status: 503 });
    const { raw, title, thumbnailStatement } = schema.parse(await request.json());
    const parsed = parsePreparedNarrative(raw, { title, thumbnailStatement });
    const pkg = parsed.package;
    const segments = preparedNarrativeSegments(pkg);
    const payload = {
      source_hash: parsed.sourceHash, source_url: pkg.source.url, meeting_label: pkg.program.conference_name || pkg.source.article_title,
      specialty: pkg.program.specialty, title: pkg.program.title,
      description: [pkg.program.description_opening, "", `Full source: ${pkg.source.url}`].join("\n"),
      duration_seconds: parsed.durationSeconds, starts_at: new Date().toISOString(),
      segments: segments.map((segment) => ({ title: segment.title, summary: segment.summary, script: segment.script, content_type: segment.contentType, persona_id: segment.personaId, persona_name: segment.personaName, hype_level: segment.hypeLevel, language: segment.language, citations: segment.citations, social_buzz_items: segment.socialBuzzItems, risk_flags: segment.riskFlags, confidence_score: segment.confidenceScore }))
    };
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_prepared_meeting_watch", { payload });
    if (error) throw error;
    const broadcast = Array.isArray(data) ? data[0] : data;
    if (!broadcast?.id) throw new Error("Prepared broadcast creation returned no id.");
    if (broadcast.status !== "planned") return NextResponse.json({ ok: true, alreadyExists: true, broadcast });
    await supabase.from("meeting_watch_broadcasts").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", broadcast.id);
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/meeting-watch-broadcast.yml/dispatches`, {
      method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "main", inputs: { meeting_watch_broadcast_id: broadcast.id } })
    });
    if (!response.ok) {
      const detail = await response.text();
      await supabase.from("meeting_watch_broadcasts").update({ status: "failed", failure_reason: `GitHub dispatch failed: ${response.status} ${detail}` }).eq("id", broadcast.id);
      throw new Error(`GitHub workflow dispatch failed: ${response.status} ${detail}`);
    }
    return NextResponse.json({ ok: true, broadcastId: broadcast.id, durationSeconds: parsed.durationSeconds, cardCount: pkg.cards.length, speakerTurnCount: segments.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
