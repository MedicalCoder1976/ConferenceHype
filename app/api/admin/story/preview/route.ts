import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { parsePreparedStory, storyInputSchema } from "@/lib/story/preparedStory";

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const story = parsePreparedStory(storyInputSchema.parse(await request.json()));
    return NextResponse.json({
      ok: true,
      title: story.input.title,
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
