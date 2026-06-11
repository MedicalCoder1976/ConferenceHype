import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { replaceConferenceCoverageSlotsInDb } from "@/lib/db";

const bodySchema = z.object({
  conferenceId: z.string().uuid(),
  startsAt: z.array(z.string().datetime()).max(8 * 31)
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const slots = await replaceConferenceCoverageSlotsInDb(body);
    return NextResponse.json({ ok: true, slots });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
