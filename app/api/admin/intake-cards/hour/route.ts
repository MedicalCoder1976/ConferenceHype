import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getPreviousDayBatchItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import {
  buildBatchSegment,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";

const bodySchema = z.object({
  coverageDate: z.string().date(),
  startsAt: z.string().datetime(),
  conferenceIds: z.array(z.string().uuid()).max(100).default([]),
  journalIds: z.array(z.string().uuid()).max(100).default([]),
  sourceIds: z.array(z.string().uuid()).max(200).default([]),
  priorityTopics: z.array(z.string().trim().min(2).max(180)).max(100).default([]),
  exclusions: z.array(z.string().trim().min(2).max(180)).max(100).default([]),
  maxCards: z.number().int().min(1).max(84).default(24)
});

function includesAnyTerm(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function priorityScore(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term.toLowerCase())).length;
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const [items, conferences, journals] = await Promise.all([
      getPreviousDayBatchItemsFromDb(body.coverageDate, 240),
      getMedicalConferencesFromDb(),
      getOncologyJournalsFromDb()
    ]);
    const selectedConferences = (conferences ?? []).filter((conference) =>
      body.conferenceIds.includes(conference.id)
    );
    const selectedJournals = (journals ?? []).filter((journal) =>
      body.journalIds.includes(journal.id)
    );
    const filtered = (items ?? [])
      .filter((item) =>
        itemMatchesSelections({
          item,
          conferences: selectedConferences,
          journals: selectedJournals,
          sourceIds: body.sourceIds
        })
      )
      .filter((item) => {
        if (!body.exclusions.length) {
          return true;
        }
        return !includesAnyTerm(
          `${item.title} ${item.excerpt} ${item.sourceName}`,
          body.exclusions
        );
      })
      .sort((a, b) => {
        const aText = `${a.title} ${a.excerpt}`;
        const bText = `${b.title} ${b.excerpt}`;
        const priorityDifference =
          priorityScore(bText, body.priorityTopics) -
          priorityScore(aText, body.priorityTopics);
        if (priorityDifference !== 0) {
          return priorityDifference;
        }
        return a.rank - b.rank;
      })
      .slice(0, body.maxCards);

    if (filtered.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No previous-day batch items match this slot's selected conferences, journals, or sources."
        },
        { status: 404 }
      );
    }

    const startLabel = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).format(new Date(body.startsAt));
    const segments = filtered.map((item, index) =>
      buildBatchSegment(item, personaIdForBatchIndex(index), {
        startsAt: body.startsAt,
        index,
        batchLabel: `One-hour batch ${startLabel}`
      })
    );
    const saved = (await saveGeneratedSegmentsToDb(segments)) ?? segments;
    return NextResponse.json({
      ok: true,
      count: saved.length,
      segments: saved
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
