import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getOncologyJournalsFromDb, upsertOncologyJournalInDb } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(180),
  abbreviation: z.string().trim().min(1).max(40),
  rssUrl: z.string().url(),
  officialUrl: z.string().url()
});

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    return NextResponse.json({ ok: true, journals: (await getOncologyJournalsFromDb()) ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = schema.parse(await request.json());
    const journal = await upsertOncologyJournalInDb({ ...body, enabled: true });
    return NextResponse.json({ ok: true, journal });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
