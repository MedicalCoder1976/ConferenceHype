import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getSegmentByIdFromDb,
  saveGeneratedSegmentsToDb,
  updateSegmentScheduleInDb
} from "@/lib/db";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { makeScheduledCopy } from "@/lib/reusableSegments";

const bodySchema = z.object({
  segmentId: z.string().min(1),
  approvedAt: z.string().datetime(),
  script: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const existing = await getSegmentByIdFromDb(body.segmentId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Segment was not found." }, { status: 404 });
    }
    const editedSegment = {
      ...existing,
      script: body.script ?? existing.script,
      status: "approved" as const,
      approvedAt: body.approvedAt
    };
    const errors = validateSegmentForApproval(editedSegment);
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }
    if (existing.status === "pending_review") {
      const [copy] =
        (await saveGeneratedSegmentsToDb([
          makeScheduledCopy({
            source: existing,
            approvedAt: body.approvedAt,
            script: editedSegment.script
          })
        ])) ?? [];
      if (!copy) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Database is not configured, so schedule changes cannot be written."
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: true, segment: copy });
    }
    const segment = await updateSegmentScheduleInDb(body);
    if (!segment) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Database is not configured, so schedule changes cannot be written."
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
