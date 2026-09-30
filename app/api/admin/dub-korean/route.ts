import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getBroadcastWriteoutByIdFromDb, updateBroadcastWriteoutKoreanDubInDb } from "@/lib/db";
import { env } from "@/lib/env";

// Only statuses safe to (re-)dispatch from -- 'pending'/'processing' means a
// dub job is already in flight, and dispatching again would race it and
// produce two separate Korean uploads for the same broadcast.
const DISPATCHABLE_STATUSES = new Set(["none", "failed"]);

const bodySchema = z.object({
  writeoutId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    if (!env.GITHUB_DISPATCH_TOKEN) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "GITHUB_DISPATCH_TOKEN is not configured in Vercel, so the admin button cannot start GitHub Actions."
        },
        { status: 503 }
      );
    }

    const body = bodySchema.parse(await request.json());
    const writeout = await getBroadcastWriteoutByIdFromDb(body.writeoutId);
    if (!writeout) {
      return NextResponse.json(
        { ok: false, error: "That broadcast writeout no longer exists." },
        { status: 404 }
      );
    }
    if (!writeout.youtubeVideoId) {
      return NextResponse.json(
        { ok: false, error: "This broadcast has no English YouTube video yet, so there's nothing to dub." },
        { status: 422 }
      );
    }
    if (!writeout.cards.some((card) => card.kind === "content" && Boolean(card.script?.trim()))) {
      return NextResponse.json(
        { ok: false, error: "This broadcast has no spoken content cards to translate." },
        { status: 422 }
      );
    }
    const currentStatus = writeout.koreanDubStatus ?? "none";
    if (!DISPATCHABLE_STATUSES.has(currentStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: `A Korean dub is already "${currentStatus}" for this broadcast. Refresh the page to see its current status.`
        },
        { status: 409 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/dub-korean-broadcast.yml/dispatches`,
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
          inputs: { broadcast_writeout_id: body.writeoutId }
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { ok: false, error: `GitHub workflow dispatch failed: ${response.status} ${detail}` },
        { status: 502 }
      );
    }

    await updateBroadcastWriteoutKoreanDubInDb(body.writeoutId, { koreanDubStatus: "pending" });

    return NextResponse.json({ ok: true, workflow: "dub-korean-broadcast.yml", writeoutId: body.writeoutId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
