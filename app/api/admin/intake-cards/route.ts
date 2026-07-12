import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getIngestedItemByIdFromDb,
  getOncologyJournalsFromDb,
  getPreviousDayBatchItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { buildBatchSegment, buildPubMedBackedJournalItem } from "@/lib/intakeCards";

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
    const journals = (await getOncologyJournalsFromDb()) ?? [];
    const journalIds = new Set(journals.map((journal) => journal.id));
    const enrichedItem = await buildPubMedBackedJournalItem(item, journalIds);
    if (!enrichedItem) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This journal item does not have a usable PubMed abstract with Background, Methods, Results, and Discussion yet, so a broadcast card was not created."
        },
        { status: 422 }
      );
    }
    const segment = buildBatchSegment(enrichedItem, body.personaId, {}, journalIds);
    const [saved] = (await saveGeneratedSegmentsToDb([segment])) ?? [segment];
    return NextResponse.json({ ok: true, segment: saved ?? segment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
