import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import {
  getBroadcastSegmentsByRiskFlagFromDb,
  getPendingSegmentsFromDb,
  saveGeneratedSegmentsToDb,
  getUpcomingSlotsNeedingBatchFromDb
} from "@/lib/db";
import { filterBroadcastReadySegments } from "@/lib/data";
import { CONTENT_CARDS_PER_HOUR, scheduledContentAt } from "@/lib/broadcast/hourSchedule";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { makeScheduledCopy } from "@/lib/reusableSegments";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);

    // Look for slots starting 45–120 min from now.
    // Wide window handles GitHub Actions runner delays of up to 30 min.
    const slots = await getUpcomingSlotsNeedingBatchFromDb(45, 120);

    if (!slots.length) {
      return NextResponse.json({
        ok: true,
        message: "No upcoming slots need a batch.",
        slotsProcessed: 0
      });
    }

    const results: Array<{
      slotId: string;
      startsAt: string;
      status: string;
      count?: number;
    }> = [];

    for (const slot of slots) {
      // Skip if an auto-batch was already created for this slot
      const existing = await getBroadcastSegmentsByRiskFlagFromDb(
        `coverage_slot:${slot.id}`,
        1
      );
      if (existing && existing.length > 0) {
        results.push({ slotId: slot.id, startsAt: slot.startsAt, status: "already_batched" });
        continue;
      }

      // Pull pending segments, filter to broadcast-ready, validate each one
      const pending = await getPendingSegmentsFromDb(200);
      const candidates = filterBroadcastReadySegments(pending ?? []).filter(
        (s) => validateSegmentForApproval(s).length === 0
      );

      if (!candidates.length) {
        results.push({ slotId: slot.id, startsAt: slot.startsAt, status: "no_valid_candidates" });
        continue;
      }

      const selected = candidates.slice(0, CONTENT_CARDS_PER_HOUR);
      const scheduledSegments = selected.map((source, index) =>
        makeScheduledCopy({
          source,
          approvedAt: scheduledContentAt(slot.startsAt, index),
          script: source.script,
          extraRiskFlags: [`coverage_slot:${slot.id}`, "auto_batch_scheduled"]
        })
      );

      const saved = await saveGeneratedSegmentsToDb(scheduledSegments);
      results.push({
        slotId: slot.id,
        startsAt: slot.startsAt,
        status: "batched",
        count: saved?.length ?? 0
      });
    }

    return NextResponse.json({ ok: true, slotsProcessed: slots.length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
