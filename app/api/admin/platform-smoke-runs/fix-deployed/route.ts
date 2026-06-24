import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { markPlatformSmokeRunFixDeployedInDb } from "@/lib/db";

const bodySchema = z.object({
  runId: z.string().uuid(),
  deployed: z.boolean(),
  notes: z.string().trim().max(500).optional()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const run = await markPlatformSmokeRunFixDeployedInDb({
      id: body.runId,
      deployed: body.deployed,
      notes: body.notes
    });
    if (!run) {
      return NextResponse.json(
        { ok: false, error: "Database is not configured, so the fix-deployed flag could not be saved." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
