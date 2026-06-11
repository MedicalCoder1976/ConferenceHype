import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getSegmentByIdFromDb, replaceBroadcastSegmentInDb } from "@/lib/db";
import { validateSegmentForApproval } from "@/lib/generation/validator";

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
    const segment = await replaceBroadcastSegmentInDb({
      targetSegmentId: body.targetSegmentId,
      replacementSegmentId: body.replacementSegmentId,
      approvedAt: body.approvedAt,
      script: body.script
    });
    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
