import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getIngestedItemByIdFromDb,
  getPreviousDayBatchItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { getPersona } from "@/lib/generation/personas";
import type { ContentType, IngestedItem, Segment } from "@/lib/types";

const getSchema = z.object({
  date: z.string().date()
});

const postSchema = z.object({
  itemId: z.string().min(1),
  personaId: z.string().max(80).default("vesper-quill")
});

function contentTypeForItem(item: IngestedItem): ContentType {
  if (item.sourceType === "official") {
    return "agenda_preview";
  }
  if (item.sourceType === "company") {
    return "industry_floor";
  }
  if (item.sourceType.includes("social")) {
    return "social_signal";
  }
  return "media_roundup";
}

function cleanText(value: string, fallback: string) {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function buildBatchSegment(item: IngestedItem, personaId: string): Segment {
  const persona = getPersona(personaId);
  const detail = cleanText(
    item.excerpt,
    "The batch item did not include a summary excerpt. Open the source before approving this card."
  );
  const shortDetail = detail.length > 520 ? `${detail.slice(0, 517)}...` : detail;
  const createdAt = new Date().toISOString();
  return {
    id: `batch-intake-${randomUUID()}`,
    title: `Batch pick: ${item.title}`,
    summary: `${item.sourceName} batch item from the previous-day intake. ${shortDetail}`,
    script: [
      `This is ${persona.name} from ConferenceHype.`,
      `Previous-day batch intake selected this ${item.sourceType.replace(/_/g, " ")} item from ${item.sourceName}: ${item.title}.`,
      `Summary: ${shortDetail}`,
      "This card is source-attributed and should be reviewed before it is placed into the presentation sequence."
    ].join(" "),
    contentType: contentTypeForItem(item),
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "standard",
    language: "English",
    status: "pending_review",
    citations: [
      {
        label: `${item.sourceName}: ${item.title}`,
        url: item.url,
        sourceType: item.sourceType
      }
    ],
    socialBuzzItems: [],
    riskFlags: ["previous_day_batch_intake", "operator_selected_batch_card", "genuine_source_rewrite"],
    confidenceScore: item.excerpt ? 82 : 65,
    createdAt,
    updatedAt: createdAt
  };
}

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
