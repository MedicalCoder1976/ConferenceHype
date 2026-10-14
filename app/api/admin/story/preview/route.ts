import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { parsePreparedStory, preparedStorySegments, storyInputSchema } from "@/lib/story/preparedStory";
import { assertStoryCardsBroadcastReady } from "@/lib/story/storyBroadcastReady";
import { resolveStoryTitle } from "@/lib/story/meetingUpdateNumbering";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const story = parsePreparedStory(storyInputSchema.parse(await request.json()));
    assertStoryCardsBroadcastReady(preparedStorySegments(story));
    const titling = await resolveStoryTitle(createAdminClient(), story.input);
    return NextResponse.json({
      ok: true,
      title: titling.title,
      baseTitle: titling.baseTitle,
      updateNumber: titling.updateNumber,
      updateMeeting: titling.meeting,
      previousUpdates: titling.previousUpdates,
      topic: story.input.topic,
      spokenWords: story.spokenWords,
      durationSeconds: story.durationSeconds,
      durationMinutes: Number((story.durationSeconds / 60).toFixed(1)),
      cards: story.cards
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
