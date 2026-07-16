import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getJournalBroadcastSlotByIdFromDb } from "@/lib/db";
import { env } from "@/lib/env";

// Statuses safe to (re-)dispatch. Anything else means a workflow run for
// this slot already exists or already aired -- dispatching again would
// create a second, fully independent broadcast racing the first one.
// Confirmed live 2026-07-15: three clicks on the same slot, with no guard
// here, produced three separate YouTube videos all targeting the same
// go-live time, only one of which the database ended up tracking.
const DISPATCHABLE_STATUSES = new Set(["not_scheduled", "failed"]);

const bodySchema = z.object({
  slotId: z.string().min(1),
  journalId: z.string().min(1),
  // Comes straight from the slot's `starts_at` column, which Supabase
  // returns with a "+00:00" offset rather than a "Z" suffix -- z.string()
  // .datetime() rejects that by default, so accept any string and validate
  // it parses instead of constraining the exact ISO format.
  startAt: z.string().min(1)
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
    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Slot start time is invalid." },
        { status: 422 }
      );
    }

    const slot = await getJournalBroadcastSlotByIdFromDb(body.slotId);
    if (!slot) {
      return NextResponse.json(
        { ok: false, error: "That journal broadcast slot no longer exists." },
        { status: 404 }
      );
    }
    if (!DISPATCHABLE_STATUSES.has(slot.youtubeStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: `This slot is already "${slot.youtubeStatus}" -- dispatching again would create a second, duplicate broadcast. Refresh the page to see its current status.`
        },
        { status: 409 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/youtube-stream.yml/dispatches`,
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
            // The workflow forces DURATION_SECONDS=1800 whenever journal_id is
            // set, regardless of this input -- but sending "60" here anyway
            // made every journal-broadcast GitHub Actions run *look* like a
            // 60-minute dispatch when inspected, which is exactly what caused
            // "did the shows go back to 60 minutes?" confusion. Send the
            // honest value instead.
            duration_minutes: "30",
            stream_input_path: "public/rendered/fallback-loop.mp4",
            stream_start_time: startAt.toISOString(),
            journal_broadcast_slot_id: body.slotId,
            journal_id: body.journalId
          }
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        {
          ok: false,
          error: `GitHub workflow dispatch failed: ${response.status} ${detail}`
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, workflow: "youtube-stream.yml", slotId: body.slotId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
