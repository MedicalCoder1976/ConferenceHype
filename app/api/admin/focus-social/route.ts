import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { generateSegmentFromSources } from "@/lib/generation/llm";
import type { IngestedItem } from "@/lib/types";

const bodySchema = z.object({
  postUrl: z.string().url().optional().or(z.literal("")),
  postText: z.string().min(4).max(1200),
  operatorNote: z.string().max(600).optional().or(z.literal(""))
});

function buildFocusedSource({
  postUrl,
  postText,
  operatorNote
}: z.infer<typeof bodySchema>): IngestedItem {
  const url = postUrl || "https://x.com/hashtag/ASCOHype";
  return {
    id: `focused-x-${Date.now()}`,
    title: "Operator-focused X post for ASCO Hype",
    url,
    excerpt: [
      postText,
      operatorNote ? `Operator focus note: ${operatorNote}` : "",
      "This is an operator-selected X/social item. Treat as audience buzz until reviewed."
    ]
      .filter(Boolean)
      .join("\n"),
    sourceName: "Operator-focused X post",
    sourceType: "general_social",
    rank: 5,
    publishedAt: new Date().toISOString()
  };
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const source = buildFocusedSource(body);
    const segment = await generateSegmentFromSources({
      sources: [source],
      personaId: "vesper-quill",
      hypeLevel: "high_energy",
      contentType: "social_signal",
      editorialInstruction: [
        "Create a short radio-DJ style social desk hit from this operator-focused X post.",
        "Make it sound exciting, but label it as audience buzz or an operator-selected post.",
        "Do not treat the post as verified fact unless a primary source is included.",
        "If the post recommends snacks, coffee, a booth, a poster, or a media hit, call it an attendee tip that requires review.",
        "Mention #ASCOHype as the routing tag for more audience tips."
      ].join("\n")
    });

    await saveGeneratedSegmentsToDb([segment]);

    return NextResponse.json({
      ok: true,
      segment,
      note:
        "Focused X/social post created as a pending review segment. Approve it before broadcast."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
