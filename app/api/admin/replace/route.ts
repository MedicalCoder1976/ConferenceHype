import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getSegmentByIdFromDb,
  replaceBroadcastSegmentInDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { makeScheduledCopy } from "@/lib/reusableSegments";

const bodySchema = z.object({
  targetSegmentId: z.string().uuid().optional(),
  replacementSegmentId: z.string().uuid(),
  approvedAt: z.string().datetime(),
  script: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const replacement = await getSegmentByIdFromDb(body.replacementSegmentId);
    if (!replacement) {
      return NextResponse.json({ ok: false, error: "Replacement card was not found." }, { status: 404 });
    }
    const errors = validateSegmentForApproval({
      ...replacement,
      script: body.script
    });
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }
    let replacementSegmentId = body.replacementSegmentId;
    if (replacement.status === "pending_review") {
      const [copy] =
        (await saveGeneratedSegmentsToDb([
          makeScheduledCopy({
            source: replacement,
            approvedAt: body.approvedAt,
            script: body.script
          })
        ])) ?? [];
      if (!copy) {
        return NextResponse.json(
          { ok: false, error: "Could not create a scheduled copy of the ready card." },
          { status: 503 }
        );
      }
      replacementSegmentId = copy.id;
    }
    const segment = await replaceBroadcastSegmentInDb({
      targetSegmentId: body.targetSegmentId,
      replacementSegmentId,
      approvedAt: body.approvedAt,
      script: body.script
    });
    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
