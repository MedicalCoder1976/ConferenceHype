import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  replaceConferenceCoverageSlotsInDb,
  updateConferenceCoverageApprovalInDb
} from "@/lib/db";

const bodySchema = z.object({
  conferenceId: z.string().uuid(),
  startsAt: z.array(z.string().datetime()).max(24 * 31)
});

const approvalSchema = z.object({
  slotIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["approve", "draft", "reject"]),
  approvalScope: z.enum(["slot", "day", "week"])
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

export async function PATCH(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = approvalSchema.parse(await request.json());
    const slots = await updateConferenceCoverageApprovalInDb(body);
    return NextResponse.json({ ok: true, slots });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
