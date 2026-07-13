import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { createJournalBroadcastSlotInDb } from "@/lib/db";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 30;

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  journalId: z.string().uuid()
});

// Mirrors /api/admin/coverage-slots/create-broadcast's role for the
// conference format: provisions the approved journal_broadcast_slots row
// the twice-hourly cron polls for once it renders/streams a 30-minute
// single-journal show. journalId is always operator-picked -- unlike the
// conference route, there's no "fall back to the first enabled" default.
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const slot = await createJournalBroadcastSlotInDb({
      startsAt: body.startsAt,
      journalId: body.journalId
    });
    return NextResponse.json({ ok: true, journalBroadcastSlotId: slot.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not create the journal broadcast slot.") },
      { status: 400 }
    );
  }
}
