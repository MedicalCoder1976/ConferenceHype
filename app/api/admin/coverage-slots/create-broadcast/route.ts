import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { createGeneralCoverageSlotInDb } from "@/lib/db";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 30;

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  conferenceId: z.string().uuid().optional()
});

// Provisions the approved coverage slot the cron (youtube-stream.yml) polls
// for, so it renders and streams the cards already scheduled into this hour
// via /api/admin/intake-cards/hour. Kept as its own step (rather than folded
// into card creation) so an operator can review the queued cards before
// committing to actually building and airing the broadcast.
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const slot = await createGeneralCoverageSlotInDb({
      startsAt: body.startsAt,
      conferenceId: body.conferenceId
    });
    return NextResponse.json({ ok: true, coverageSlotId: slot.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not create the broadcast slot.") },
      { status: 400 }
    );
  }
}
