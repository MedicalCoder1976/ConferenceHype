import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { updateSegmentDecisionInDb, getSegmentsByIdsFromDb } from "@/lib/db";
import { createMeetingWatchBroadcastInDb } from "@/lib/meetingWatch/db";

const episodeSchema = z.object({
  cardIds: z.array(z.string().uuid()).min(1),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1)
});

const schema = z.object({
  sourceUrl: z.string().url(),
  meetingLabel: z.string().trim().min(1).max(120),
  specialty: z.string().trim().max(80).optional(),
  startsAt: z.string().datetime(),
  episodeIntervalMinutes: z.number().int().min(15).max(180).default(30),
  episodes: z.array(episodeSchema).min(1).max(6)
});

// Commits a /develop preview: approves every card in every episode, then
// creates one meeting_watch_broadcasts row per episode, starting at
// startsAt and spaced episodeIntervalMinutes apart -- the row the
// meeting-watch-broadcast.yml poller picks up at air time.
export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = schema.parse(await request.json());
    const startsAt = new Date(body.startsAt);
    const broadcasts = [];
    for (let index = 0; index < body.episodes.length; index += 1) {
      const episode = body.episodes[index];
      const segments = await getSegmentsByIdsFromDb(episode.cardIds);
      for (const segment of segments) {
        if (segment.status === "pending_review") {
          await updateSegmentDecisionInDb({ segmentId: segment.id, action: "approve", script: segment.script });
        }
      }
      const episodeStartsAt = new Date(startsAt.getTime() + index * body.episodeIntervalMinutes * 60_000);
      const broadcast = await createMeetingWatchBroadcastInDb({
        sourceUrl: body.sourceUrl,
        meetingLabel: body.meetingLabel,
        specialty: body.specialty,
        episodeIndex: index,
        episodeCount: body.episodes.length,
        title: episode.title,
        description: episode.description,
        cardIds: episode.cardIds,
        startsAt: episodeStartsAt.toISOString()
      });
      broadcasts.push(broadcast);
    }
    return NextResponse.json({ ok: true, broadcasts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
