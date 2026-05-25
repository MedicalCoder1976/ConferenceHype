import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { updateSegmentScheduleInDb } from "@/lib/db";

const bodySchema = z.object({
  segmentId: z.string().min(1),
  approvedAt: z.string().datetime()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
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
