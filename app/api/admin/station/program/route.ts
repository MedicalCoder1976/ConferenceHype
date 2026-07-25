import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSegmentByIdFromDb, updateSegmentDecisionInDb } from "@/lib/db";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { getStationProgramFromDb } from "@/lib/station/db";
import { updateStationProgramDeliveryInDb } from "@/lib/station/delivery";

const schema = z.object({ programId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = schema.parse(await request.json());
    const program = await getStationProgramFromDb(body.programId);
    const isJournalProgram = program?.programType === "new" && Boolean(program.journalId);
    const isWeekendProgram = program?.programType === "weekend_roundup";
    if (!program || (!isJournalProgram && !isWeekendProgram)) {
      throw new Error("Only a new journal or weekend-roundup program can be rendered; replay programs already use a verified video.");
    }
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error("GITHUB_DISPATCH_TOKEN is not configured.");
    const selectedSegments = (await Promise.all(program.cardIds.map((id) => getSegmentByIdFromDb(id))))
      .filter((segment) => Boolean(segment));
    const qualityPassed = selectedSegments.filter(
      (segment) => segment && validateSegmentForApproval(segment).length === 0
    );
    if (qualityPassed.length === 0) {
      throw new Error("None of the selected journal cards passed broadcast approval validation.");
    }
    for (const segment of qualityPassed) {
      if (segment && segment.status === "pending_review") {
        await updateSegmentDecisionInDb({
          segmentId: segment.id,
          action: "approve",
          script: segment.script
        });
      }
    }
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/station-program.yml/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ ref: "main", inputs: { station_program_id: program.id, journal_id: program.journalId ?? "", program_mode: isWeekendProgram ? "weekend30" : "journal30", weekend_roundup_part: isWeekendProgram ? String(program.position + 1) : "", stream_start_time: new Date().toISOString() } })
    });
    if (!response.ok) throw new Error(`GitHub dispatch failed: ${response.status} ${await response.text()}`);
    await updateStationProgramDeliveryInDb(program.id, { status: "rendering", failureReason: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
