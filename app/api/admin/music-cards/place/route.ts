import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  replaceBroadcastSegmentInDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import {
  buildOperatorMusicSegment,
  operatorMusicTrack
} from "@/lib/broadcast/operatorMusic";

const bodySchema = z.object({
  trackId: z.string().min(1),
  approvedAt: z.string().datetime(),
  targetSegmentId: z.string().uuid().optional()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const track = operatorMusicTrack(body.trackId);
    if (!track) {
      return NextResponse.json(
        { ok: false, error: "Music track is not in the approved library." },
        { status: 422 }
      );
    }

    const [created] =
      (await saveGeneratedSegmentsToDb([
        buildOperatorMusicSegment({ track, approvedAt: body.approvedAt })
      ])) ?? [];
    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Database is not configured, so the music card could not be placed." },
        { status: 503 }
      );
    }

    const segment = await replaceBroadcastSegmentInDb({
      targetSegmentId: body.targetSegmentId,
      replacementSegmentId: created.id,
      approvedAt: body.approvedAt,
      script: created.script
    });
    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
