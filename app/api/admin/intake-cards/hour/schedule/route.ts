import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getSegmentByIdFromDb, saveGeneratedSegmentsToDb } from "@/lib/db";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { makeScheduledCopy } from "@/lib/reusableSegments";

const CONTENT_SECONDS = 40;
const MUSIC_SECONDS = 20;
const CONTENT_PER_BLOCK = 7;
const BLOCK_SECONDS = CONTENT_PER_BLOCK * CONTENT_SECONDS + MUSIC_SECONDS;

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  segmentIds: z.array(z.string().min(1)).min(1).max(84)
});

function scheduledAt(startsAt: string, index: number) {
  const start = new Date(startsAt).getTime();
  const block = Math.floor(index / CONTENT_PER_BLOCK);
  const position = index % CONTENT_PER_BLOCK;
  return new Date(start + block * BLOCK_SECONDS * 1000 + position * CONTENT_SECONDS * 1000)
    .toISOString();
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const sources = await Promise.all(
      body.segmentIds.map((segmentId) => getSegmentByIdFromDb(segmentId))
    );
    const missingIndex = sources.findIndex((segment) => !segment);
    if (missingIndex >= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Ready card ${missingIndex + 1} was not found, so the hour was not scheduled.`
        },
        { status: 404 }
      );
    }

    const scheduledSegments = sources.map((source, index) =>
      makeScheduledCopy({
        source: source!,
        approvedAt: scheduledAt(body.startsAt, index),
        script: source!.script
      })
    );
    const validationErrors = scheduledSegments.flatMap((segment, index) =>
      validateSegmentForApproval(segment).map((error) => `Card ${index + 1}: ${error}`)
    );
    if (validationErrors.length) {
      return NextResponse.json({ ok: false, errors: validationErrors }, { status: 422 });
    }

    const saved = await saveGeneratedSegmentsToDb(scheduledSegments);
    if (!saved?.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Database is not configured, so scheduled cards could not be written."
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: saved.length,
      segments: saved
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
