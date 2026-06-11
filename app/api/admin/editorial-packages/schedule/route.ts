import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getEditorialPackageByIdFromDb,
  markEditorialPackageScheduledInDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { packageToScheduledSegments } from "@/lib/editorial/packages";

const schema = z.object({
  packageId: z.string().uuid(),
  startsAt: z.string().datetime()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = schema.parse(await request.json());
    const editorialPackage = await getEditorialPackageByIdFromDb(body.packageId);
    if (!editorialPackage) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    if (editorialPackage.status === "scheduled") {
      return NextResponse.json(
        { ok: false, error: "This package is already scheduled. Develop a new edition to schedule it again." },
        { status: 409 }
      );
    }
    const segments = packageToScheduledSegments(editorialPackage, new Date(body.startsAt));
    const saved = await saveGeneratedSegmentsToDb(segments);
    const updated = await markEditorialPackageScheduledInDb(editorialPackage.id, body.startsAt);
    return NextResponse.json({ ok: true, editorialPackage: updated, segmentCount: saved?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
