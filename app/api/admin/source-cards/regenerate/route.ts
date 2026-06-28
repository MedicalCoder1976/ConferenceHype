import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getMedicalConferenceByIdFromDb,
  getOncologyJournalByIdFromDb,
  getPendingSegmentsFromDb,
  getSourcesFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { searchTopicFallback } from "@/lib/sources/x";
import {
  dedupeAgainstFreshSegments,
  entityName as weeklyEntityName,
  entitySelection,
  existingWeeklyKeys,
  generateWeeklyCardsForEntities,
  orderedPickForEntity,
  topicSearchEntityFor,
  type WeeklyCardEntity
} from "@/lib/weeklySourceCardGeneration";
import { weeklySourceWeekKey, WEEKLY_SOURCE_POOL_FLAG } from "@/lib/weeklySourceCards";
import type { DailyCoveragePlan, IngestedItem } from "@/lib/types";

const bodySchema = z.object({
  entityType: z.enum(["conference", "journal", "source"]),
  entityId: z.string().min(1)
});

function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());

    let entity: WeeklyCardEntity;
    if (body.entityType === "conference") {
      const conference = await getMedicalConferenceByIdFromDb(body.entityId);
      if (!conference) {
        return NextResponse.json({ ok: false, error: "Conference not found." }, { status: 404 });
      }
      entity = { type: "conference", conference };
    } else if (body.entityType === "journal") {
      const journal = await getOncologyJournalByIdFromDb(body.entityId);
      if (!journal) {
        return NextResponse.json({ ok: false, error: "Journal not found." }, { status: 404 });
      }
      entity = { type: "journal", journal };
    } else {
      const sources = (await getSourcesFromDb()) ?? [];
      const source = sources.find((item) => item.id === body.entityId);
      if (!source) {
        return NextResponse.json({ ok: false, error: "Source not found." }, { status: 404 });
      }
      entity = { type: "source", source };
    }

    const coverageDate = easternDate();
    const weekKey = weeklySourceWeekKey();
    // Scoped to just this one entity -- runIngestionJob only fetches sources
    // whose id appears in the plan, so this doesn't re-sweep the whole catalog.
    const scopedPlan: DailyCoveragePlan = {
      coverageDate,
      conferenceIds: entity.type === "conference" ? [entity.conference.id] : [],
      journalIds: entity.type === "journal" ? [entity.journal.id] : [],
      sourceIds: entity.type === "source" ? [entity.source.id] : [],
      customItems: [],
      priorityTopics: [],
      exclusions: [],
      breakingNewsEnabled: true,
      notes: `Admin-triggered regenerate for ${weeklyEntityName(entity)}`
    };

    const [items, pendingSegments] = await Promise.all([
      runIngestionJob(coverageDate, scopedPlan) as Promise<IngestedItem[]>,
      getPendingSegmentsFromDb(2000)
    ]);
    const existingKeys = existingWeeklyKeys(pendingSegments ?? [], weekKey, WEEKLY_SOURCE_POOL_FLAG);

    // The admin explicitly asked for more options, so use the generous end
    // of the normal weekly budget rather than the lighter automatic default.
    const cardsPerSourceFor = (target: WeeklyCardEntity) => (target.type === "journal" ? 12 : 6);

    const selected = orderedPickForEntity(items, entitySelection(entity), cardsPerSourceFor(entity));
    const topicFallback =
      selected.length === 0 ? await searchTopicFallback([topicSearchEntityFor(entity)]) : new Map<string, IngestedItem>();

    const generated = await generateWeeklyCardsForEntities({
      entities: [entity],
      items,
      weekKey,
      existingKeys,
      cardsPerSourceFor,
      topicFallback
    });

    const freshPendingSegments = (await getPendingSegmentsFromDb(2000)) ?? [];
    const deduped = dedupeAgainstFreshSegments(generated, freshPendingSegments, weekKey, WEEKLY_SOURCE_POOL_FLAG);
    const saved = (await saveGeneratedSegmentsToDb(deduped)) ?? deduped;
    return NextResponse.json({
      ok: true,
      entityName: weeklyEntityName(entity),
      generated: saved.length
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not generate more cards.") },
      { status: 400 }
    );
  }
}
