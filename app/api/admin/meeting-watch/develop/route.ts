import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import {
  discoverMeetingWatchArticles,
  generateCardsForEpisode,
  splitArticlesIntoEpisodes
} from "@/lib/editorial/meetingWatchPipeline";
import { assertMeetingNameAndYear } from "@/lib/meetingWatch/packaging";

const schema = z.object({
  sourceUrl: z.string().url(),
  meetingLabel: z.string().trim().min(1).max(120),
  specialty: z.string().trim().max(80).optional(),
  episodeCount: z.number().int().min(1).max(6)
});

// Preview step: discovers + dedupes real articles from sourceUrl, generates
// real cards for each episode, and saves them as pending_review segments --
// but does NOT create the meeting_watch_broadcasts rows yet. That happens
// in /schedule once the operator picks a start time, mirroring the
// editorial_packages "develop, preview, then explicitly schedule" flow.
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = schema.parse(await request.json());
    const meetingLabel = assertMeetingNameAndYear(body.meetingLabel);
    const articles = await discoverMeetingWatchArticles({
      seedUrl: body.sourceUrl,
      meetingLabel,
      episodeCount: body.episodeCount
    });
    const episodeArticles = splitArticlesIntoEpisodes(articles, body.episodeCount);
    const episodes = [];
    for (let index = 0; index < episodeArticles.length; index += 1) {
      const segments = await generateCardsForEpisode(episodeArticles[index], meetingLabel);
      const saved = await saveGeneratedSegmentsToDb(segments);
      episodes.push({
        index,
        articleCount: episodeArticles[index].length,
        cardIds: (saved ?? []).map((segment) => segment.id),
        cards: (saved ?? []).map((segment) => ({ id: segment.id, title: segment.title, script: segment.script })),
        clusters: Array.from(new Set(episodeArticles[index].map((article) => article.cluster)))
      });
    }
    return NextResponse.json({ ok: true, sourceUrl: body.sourceUrl, meetingLabel, specialty: body.specialty, episodes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
