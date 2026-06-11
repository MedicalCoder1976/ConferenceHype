import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getOncologyJournalByIdFromDb,
  saveEditorialPackageToDb,
  updateOncologyJournalIssueKeyInDb
} from "@/lib/db";
import { developJournalWatchPackage } from "@/lib/editorial/packages";
import { fetchRssSource } from "@/lib/sources/rss";

const schema = z.object({ journalId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const { journalId } = schema.parse(await request.json());
    const journal = await getOncologyJournalByIdFromDb(journalId);
    if (!journal) return NextResponse.json({ ok: false, error: "Journal not found." }, { status: 404 });
    const items = await fetchRssSource({
      id: journal.id,
      name: journal.name,
      url: journal.rssUrl,
      type: "media",
      rank: 1,
      enabled: true
    });
    const developed = await developJournalWatchPackage(journal, items);
    const editorialPackage = await saveEditorialPackageToDb(developed);
    await updateOncologyJournalIssueKeyInDb(journal.id, developed.editionKey);
    return NextResponse.json({ ok: true, editorialPackage });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
