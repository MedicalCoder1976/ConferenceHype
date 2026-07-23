import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { buildJournalCardDecks } from "@/lib/cardDeck";
import { getAdminSnapshot } from "@/lib/data";
import { buildStationDraft } from "@/lib/station/schedule";
import {
  activateStationScheduleInDb,
  getStationSchedulesFromDb,
  saveStationDraftToDb
} from "@/lib/station/db";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate_draft"),
    scheduleDate: z.string().date(),
    timezone: z.string().min(1).default("America/New_York")
  }),
  z.object({
    action: z.literal("activate"),
    scheduleId: z.string().uuid()
  })
]);

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    if (body.action === "activate") {
      const schedule = await activateStationScheduleInDb(body.scheduleId);
      return NextResponse.json({ ok: true, schedule });
    }

    const snapshot = await getAdminSnapshot(
      new Date(`${body.scheduleDate}T12:00:00Z`),
      24
    );
    const journalCardDecks = buildJournalCardDecks(
      snapshot.deckSegments,
      snapshot.oncologyJournals
    );
    const existingSchedules = (await getStationSchedulesFromDb(60)) ?? [];
    const replayPrograms = existingSchedules
      .flatMap((schedule) => schedule.programs)
      .filter((program) => program.status === "verified" && program.youtubeVideoId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const programs = buildStationDraft({
      scheduleDate: body.scheduleDate,
      journals: snapshot.oncologyJournals,
      journalCardDecks,
      replayPrograms
    });
    if (programs.length !== 6) {
      return NextResponse.json(
        {
          ok: false,
          error: `A station day requires six specialties; only ${programs.length} could be planned.`
        },
        { status: 422 }
      );
    }
    const schedule = await saveStationDraftToDb({
      scheduleDate: body.scheduleDate,
      timezone: body.timezone,
      programs
    });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
