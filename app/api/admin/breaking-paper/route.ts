import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { fetchBreakingPaper } from "@/lib/breakingPaper";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { env } from "@/lib/env";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { createStationBreakInInDb } from "@/lib/station/db";
import { nextBreakInBoundary } from "@/lib/station/schedule";
import type { Segment } from "@/lib/types";

export const runtime = "nodejs";
const bodySchema = z.object({ sourceUrl: z.string().url(), placement: z.enum(["top", "bottom"]) });

async function dispatch(input: { breakInId: string; segmentId: string; targetAt: string; broadcastTitle: string; diseaseType: string; paperTitle: string }) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { dispatched: false, error: "GITHUB_DISPATCH_TOKEN is not configured." };
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/station-breakin.yml/dispatches`, {
    method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { stream_start_time: input.targetAt, breaking_segment_id: input.segmentId, station_breakin_id: input.breakInId, broadcast_title: input.broadcastTitle, disease_type: input.diseaseType, paper_title: input.paperTitle } })
  });
  if (!response.ok) return { dispatched: false, error: `GitHub dispatch failed: ${response.status} ${await response.text()}` };
  return { dispatched: true };
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const paper = await fetchBreakingPaper(body.sourceUrl);
    const targetAt = nextBreakInBoundary(new Date(), body.placement).toISOString();
    const now = new Date().toISOString();
    const segment: Segment = {
      id: crypto.randomUUID(), title: paper.title, summary: paper.abstract, script: paper.script, contentType: "abstract_buzz",
      personaId: "echo-sage", personaName: "ConferenceHype Breaking Paper Desk", hypeLevel: "high_energy", language: "English", status: "approved",
      citations: [{ label: paper.journal, url: body.sourceUrl, sourceType: "manual" }], socialBuzzItems: [],
      riskFlags: ["operator_breaking_news", "breaking_paper", "broadcast_ready"], confidenceScore: 100, createdAt: now, approvedAt: targetAt, updatedAt: now
    };
    const errors = validateSegmentForApproval(segment);
    if (errors.length) return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 422 });
    const [saved] = (await saveGeneratedSegmentsToDb([segment])) ?? [];
    if (!saved) return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
    const breakIn = await createStationBreakInInDb({ placement: body.placement, targetAt, title: paper.title, summary: paper.abstract, script: paper.script, specialty: paper.diseaseType, sourceLabel: paper.journal, sourceUrl: body.sourceUrl, segmentId: saved.id });
    if (!breakIn) return NextResponse.json({ ok: false, error: "Could not save the breaking-paper broadcast." }, { status: 503 });
    const broadcastTitle = `Physician Education: Breaking Paper | ${paper.diseaseType} | ${paper.title}`.slice(0, 100);
    const dispatchResult = await dispatch({ breakInId: breakIn.id, segmentId: saved.id, targetAt, broadcastTitle, diseaseType: paper.diseaseType, paperTitle: paper.title });
    return NextResponse.json({ ok: true, dispatch: dispatchResult, paper: { title: paper.title, diseaseType: paper.diseaseType, journal: paper.journal, targetAt, dispatched: dispatchResult.dispatched } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

