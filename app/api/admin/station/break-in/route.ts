import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { env } from "@/lib/env";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { createStationBreakInInDb } from "@/lib/station/db";
import { nextBreakInBoundary } from "@/lib/station/schedule";
import type { Segment } from "@/lib/types";

const bodySchema = z.object({
  placement: z.enum(["top", "bottom"]),
  title: z.string().min(8).max(180),
  summary: z.string().min(40).max(1200),
  script: z.string().min(80).max(8000),
  specialty: z.string().max(100).optional(),
  sourceLabel: z.string().min(3).max(180),
  sourceUrl: z.string().url()
});

async function dispatchBreakIn(input: {
  breakInId: string;
  segmentId: string;
  targetAt: string;
}) {
  if (!env.GITHUB_DISPATCH_TOKEN) {
    return { dispatched: false, error: "GITHUB_DISPATCH_TOKEN is not configured." };
  }
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/station-breakin.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          stream_start_time: input.targetAt,
          breaking_segment_id: input.segmentId,
          station_breakin_id: input.breakInId
        }
      })
    }
  );
  if (!response.ok) {
    return {
      dispatched: false,
      error: `GitHub dispatch failed: ${response.status} ${await response.text()}`
    };
  }
  return { dispatched: true };
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const targetAt = nextBreakInBoundary(new Date(), body.placement).toISOString();
    const now = new Date().toISOString();
    const segment: Segment = {
      id: crypto.randomUUID(),
      title: body.title,
      summary: body.summary,
      script: body.script,
      contentType: "media_roundup",
      personaId: "echo-sage",
      personaName: "ConferenceHype Breaking News Desk",
      hypeLevel: "high_energy",
      language: "English",
      status: "approved",
      citations: [
        { label: body.sourceLabel, url: body.sourceUrl, sourceType: "manual" }
      ],
      socialBuzzItems: [],
      riskFlags: ["operator_breaking_news", "broadcast_ready"],
      confidenceScore: 100,
      createdAt: now,
      approvedAt: targetAt,
      updatedAt: now
    };
    const errors = validateSegmentForApproval(segment);
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }
    const [saved] = (await saveGeneratedSegmentsToDb([segment])) ?? [];
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: "Database is not configured." },
        { status: 503 }
      );
    }
    const breakIn = await createStationBreakInInDb({
      ...body,
      targetAt,
      segmentId: saved.id
    });
    if (!breakIn) {
      return NextResponse.json(
        { ok: false, error: "Could not save the station break-in." },
        { status: 503 }
      );
    }
    const dispatch = await dispatchBreakIn({
      breakInId: breakIn.id,
      segmentId: saved.id,
      targetAt
    });
    return NextResponse.json({ ok: true, breakIn, dispatch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
