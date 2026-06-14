import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getMedicalConferenceByIdFromDb,
  getRecentIngestedItemsFromDb,
  saveEditorialPackageToDb
} from "@/lib/db";
import { developMeetingWatchPackage } from "@/lib/editorial/packages";
import { fetchPageSummary } from "@/lib/sources/scraper";
import type { IngestedItem } from "@/lib/types";

const schema = z.object({ conferenceId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const { conferenceId } = schema.parse(await request.json());
    const conference = await getMedicalConferenceByIdFromDb(conferenceId);
    if (!conference) return NextResponse.json({ ok: false, error: "Conference not found." }, { status: 404 });
    const [official] = await fetchPageSummary({
      id: conference.id,
      name: conference.name,
      url: conference.officialUrl,
      type: "official",
      rank: 1,
      enabled: true
    });
    const recent = (await getRecentIngestedItemsFromDb(24 * 30, 240)) ?? [];
    const terms = [conference.name, conference.acronym].filter(Boolean).map((value) => value!.toLowerCase());
    const relevant = recent.filter((item) =>
      terms.some((term) => `${item.title} ${item.excerpt} ${item.sourceName}`.toLowerCase().includes(term))
    );
    const sources: IngestedItem[] = [official, ...relevant].filter(Boolean).slice(0, 30);
    const developed = await developMeetingWatchPackage(conference, sources);
    const editorialPackage = await saveEditorialPackageToDb(developed);
    return NextResponse.json({ ok: true, editorialPackage });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
