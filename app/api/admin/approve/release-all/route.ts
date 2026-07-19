import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import {
  bulkApproveSegmentsInDb,
  getAllApprovedOrRenderedSegmentsFromDb,
  getAllPendingSegmentsFromDb
} from "@/lib/db";
import { filterBroadcastReadySegments } from "@/lib/data";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { contentSignature } from "@/lib/segments/contentSignature";

// Bulk-releases every pending_review segment that has not been broadcast
// (no approved or rendered sibling citing the same source) into the
// approved pool, as long as it passes the same quality gates a manual
// single-card approve already enforces: filterBroadcastReadySegments (the
// same broadcast-readiness filter every review list in the admin already
// applies) and validateSegmentForApproval (the same structural check
// /api/admin/approve runs on every single approval). Cards that fail
// either check are skipped, not force-approved -- "release all" does not
// mean "skip review standards," it means "don't make a human click
// approve one at a time for content that already clears the bar."
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);

    const [pending, alreadyCovered] = await Promise.all([
      getAllPendingSegmentsFromDb(),
      getAllApprovedOrRenderedSegmentsFromDb()
    ]);

    if (pending === null || alreadyCovered === null) {
      return NextResponse.json(
        {
          ok: false,
          error: "Database is not configured, so cards could not be released."
        },
        { status: 503 }
      );
    }

    const coveredSignatures = new Set(alreadyCovered.map((segment) => contentSignature(segment)));

    let alreadyBroadcastOrQueued = 0;
    let duplicateWithinPending = 0;
    const seenSignatures = new Set<string>();
    const deduped = pending.filter((segment) => {
      const signature = contentSignature(segment);
      if (coveredSignatures.has(signature)) {
        alreadyBroadcastOrQueued += 1;
        return false;
      }
      if (seenSignatures.has(signature)) {
        duplicateWithinPending += 1;
        return false;
      }
      seenSignatures.add(signature);
      return true;
    });

    const qualityChecked = filterBroadcastReadySegments(deduped);
    const failedQualityFilter = deduped.length - qualityChecked.length;

    const toApprove: string[] = [];
    const rejected: { title: string; errors: string[] }[] = [];
    for (const segment of qualityChecked) {
      const errors = validateSegmentForApproval(segment);
      if (errors.length > 0) {
        rejected.push({ title: segment.title, errors });
        continue;
      }
      toApprove.push(segment.id);
    }

    const approvedCount = await bulkApproveSegmentsInDb(toApprove);

    return NextResponse.json({
      ok: true,
      totalPending: pending.length,
      alreadyBroadcastOrQueued,
      duplicateWithinPending,
      failedQualityFilter,
      failedValidation: rejected.length,
      approved: approvedCount ?? 0,
      rejectedSamples: rejected.slice(0, 5)
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
