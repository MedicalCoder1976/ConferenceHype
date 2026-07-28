import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { parsePreparedNarrative } from "@/lib/meetingWatch/preparedNarrative";
const schema = z.object({ raw: z.string().min(2_000).max(500_000) });
export async function POST(request: NextRequest) { try { assertAdminRequest(request); const { raw } = schema.parse(await request.json()); const parsed = parsePreparedNarrative(raw); return NextResponse.json({ ok: true, package: parsed.package, spokenWords: parsed.spokenWords, durationSeconds: parsed.durationSeconds, durationMinutes: Number((parsed.durationSeconds / 60).toFixed(1)), sourceHash: parsed.sourceHash, trialOrderNormalized: parsed.trialOrderNormalized, preambleRemoved: parsed.preambleRemoved }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 }); } }
