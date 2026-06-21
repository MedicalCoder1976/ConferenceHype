import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getPendingSegmentsFromDb,
  getPreviousDayBatchItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import {
  buildBatchSegment,
  buildConferenceContextItem,
  buildPubMedBackedJournalItem,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";
import { errorMessage } from "@/lib/errors";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { sortWeeklyReadySegmentsForSelection } from "@/lib/weeklySourceCards";
import type { IngestedItem, MedicalConference, OncologyJournal } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  coverageDate: z.string().date(),
  startsAt: z.string().datetime(),
  conferenceIds: z.array(z.string().uuid()).max(100).default([]),
  journalIds: z.array(z.string().uuid()).max(100).default([]),
  sourceIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  priorityTopics: z.array(z.string().trim().min(2).max(180)).max(100).default([]),
  exclusions: z.array(z.string().trim().min(2).max(180)).max(100).default([]),
  maxCards: z.number().int().min(1).max(84).default(24)
});

type HourSourceMode =
  | "weekly_ready_pool"
  | "stored_previous_day"
  | "on_demand_ingest"
  | "selected_conference_context";

function includesAnyTerm(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function priorityScore(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term.toLowerCase())).length;
}

function realSourceIds(sourceIds: string[]) {
  return sourceIds.filter(
    (id) =>
      !id.startsWith("daily-journal-") &&
      !id.startsWith("daily-conference-") &&
      !id.startsWith("daily-custom-")
  );
}

function selectBatchItems({
  items,
  conferences,
  journals,
  sourceIds,
  priorityTopics,
  exclusions,
  maxCards
}: {
  items: IngestedItem[];
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sourceIds: string[];
  priorityTopics: string[];
  exclusions: string[];
  maxCards: number;
}) {
  return items
    .filter((item) =>
      itemMatchesSelections({
        item,
        conferences,
        journals,
        sourceIds
      })
    )
    .filter((item) => {
      if (!exclusions.length) {
        return true;
      }
      return !includesAnyTerm(`${item.title} ${item.excerpt} ${item.sourceName}`, exclusions);
    })
    .sort((a, b) => {
      const aText = `${a.title} ${a.excerpt}`;
      const bText = `${b.title} ${b.excerpt}`;
      const priorityDifference =
        priorityScore(bText, priorityTopics) - priorityScore(aText, priorityTopics);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      return a.rank - b.rank;
    })
    .slice(0, maxCards);
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const sourceIds = realSourceIds(body.sourceIds);
    const [items, conferences, journals, pendingSegments] = await Promise.all([
      getPreviousDayBatchItemsFromDb(body.coverageDate, 240),
      getMedicalConferencesFromDb(),
      getOncologyJournalsFromDb(),
      getPendingSegmentsFromDb(500)
    ]);
    const selectedConferences = (conferences ?? []).filter((conference) =>
      body.conferenceIds.includes(conference.id)
    );
    const selectedJournals = (journals ?? []).filter((journal) =>
      body.journalIds.includes(journal.id)
    );
    const weeklyReadySegments = sortWeeklyReadySegmentsForSelection(pendingSegments ?? [], {
      conferences: selectedConferences,
      journals: selectedJournals,
      sourceIds
    }).slice(0, body.maxCards);
    const newCardLimit = Math.max(body.maxCards - weeklyReadySegments.length, 0);
    let sourceMode: HourSourceMode = weeklyReadySegments.length
      ? "weekly_ready_pool"
      : "stored_previous_day";
    let filtered = newCardLimit
      ? selectBatchItems({
          items: items ?? [],
          conferences: selectedConferences,
          journals: selectedJournals,
          sourceIds,
          priorityTopics: body.priorityTopics,
          exclusions: body.exclusions,
          maxCards: newCardLimit
        })
      : [];

    if (filtered.length === 0 && newCardLimit > 0) {
      const freshItems = await runIngestionJob(body.coverageDate, {
        coverageDate: body.coverageDate,
        conferenceIds: body.conferenceIds,
        journalIds: body.journalIds,
        sourceIds: body.sourceIds,
        customItems: [],
        priorityTopics: body.priorityTopics,
        exclusions: body.exclusions,
        breakingNewsEnabled: true,
        notes: ""
      });
      sourceMode = weeklyReadySegments.length ? "weekly_ready_pool" : "on_demand_ingest";
      filtered = selectBatchItems({
        items: freshItems,
        conferences: selectedConferences,
        journals: selectedJournals,
        sourceIds,
        priorityTopics: body.priorityTopics,
        exclusions: body.exclusions,
        maxCards: newCardLimit
      });
    }

    if (filtered.length === 0 && newCardLimit > 0 && selectedConferences.length > 0) {
      sourceMode = weeklyReadySegments.length
        ? "weekly_ready_pool"
        : "selected_conference_context";
      filtered = selectBatchItems({
        items: selectedConferences.map(buildConferenceContextItem),
        conferences: selectedConferences,
        journals: selectedJournals,
        sourceIds,
        priorityTopics: body.priorityTopics,
        exclusions: body.exclusions,
        maxCards: newCardLimit
      });
    }

    if (weeklyReadySegments.length === 0 && filtered.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No stored or newly fetched batch items match this slot's selected conferences, journals, or sources."
        },
        { status: 404 }
      );
    }

    const enriched = (
      await Promise.all(filtered.map((item) => buildPubMedBackedJournalItem(item)))
    ).filter((item): item is IngestedItem => Boolean(item));

    if (weeklyReadySegments.length === 0 && enriched.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No selected items could be turned into PubMed-backed journal cards with Background, Methods, Results, and Discussion. Select a different source mix or wait for PubMed-indexed abstracts."
        },
        { status: 422 }
      );
    }

    const startLabel = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).format(new Date(body.startsAt));
    const segments = enriched.map((item, index) =>
      buildBatchSegment(item, personaIdForBatchIndex(index + weeklyReadySegments.length), {
        startsAt: body.startsAt,
        index: index + weeklyReadySegments.length,
        batchLabel: `One-hour batch ${startLabel}`
      })
    );
    const saved = (await saveGeneratedSegmentsToDb(segments)) ?? segments;
    const readySegments = [...weeklyReadySegments, ...saved];
    return NextResponse.json({
      ok: true,
      count: readySegments.length,
      reusedCount: weeklyReadySegments.length,
      generatedCount: saved.length,
      sourceMode,
      segments: readySegments
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not create one-hour ready cards.") },
      { status: 400 }
    );
  }
}
