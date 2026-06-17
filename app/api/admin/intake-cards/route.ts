import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getIngestedItemByIdFromDb,
  getPreviousDayBatchItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { buildBatchSegment } from "@/lib/intakeCards";

const getSchema = z.object({
  date: z.string().date()
});

const postSchema = z.object({
  itemId: z.string().min(1),
  personaId: z.string().max(80).default("vesper-quill")
});

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const { date } = getSchema.parse({
      date: request.nextUrl.searchParams.get("date")
    });
    return NextResponse.json({
      ok: true,
      items: (await getPreviousDayBatchItemsFromDb(date)) ?? []
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = postSchema.parse(await request.json());
    const item = await getIngestedItemByIdFromDb(body.itemId);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Batch item not found." }, { status: 404 });
    }
    const segment = buildBatchSegment(item, body.personaId);
    const [saved] = (await saveGeneratedSegmentsToDb([segment])) ?? [segment];
    return NextResponse.json({ ok: true, segment: saved ?? segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
