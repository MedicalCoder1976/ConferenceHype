import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { generateSegmentFromSources } from "@/lib/generation/llm";
import { fetchPageSummary } from "@/lib/sources/scraper";
import type { IngestedItem, SourceConfig, SourceType } from "@/lib/types";

const bodySchema = z.object({
  postUrl: z.string().max(600).optional().or(z.literal("")),
  postText: z.string().max(1200).optional().or(z.literal("")),
  operatorNote: z.string().max(600).optional().or(z.literal(""))
}).refine((body) => body.postUrl?.trim() || body.postText?.trim(), {
  message: "Add a URL, pasted text, or both before focusing for review."
});

function normalizeFocusedUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getFocusedSourceType(url: string): SourceType {
  if (/\b(x\.com|twitter\.com)\b/i.test(url)) {
    return "general_social";
  }
  if (/\basco\.org\b|\bmeetings\.asco\.org\b/i.test(url)) {
    return "official";
  }
  return "media";
}

async function summarizeFocusedUrl(url: string, sourceType: SourceType) {
  const source: SourceConfig = {
    id: `focused-url-${Date.now()}`,
    name: sourceType === "general_social" ? "Operator-focused X URL" : "Operator-focused URL",
    url,
    type: sourceType,
    rank: sourceType === "official" ? 1 : sourceType === "media" ? 2 : 5,
    enabled: true
  };

  try {
    const [summary] = await fetchPageSummary(source);
    return summary;
  } catch {
    return {
      id: source.id,
      title: source.name,
      url,
      excerpt: "Operator supplied this URL for review. Page summary could not be fetched automatically.",
      sourceName: source.name,
      sourceType,
      rank: source.rank,
      publishedAt: new Date().toISOString()
    } satisfies IngestedItem;
  }
}

async function buildFocusedSource({
  postUrl,
  postText,
  operatorNote
}: z.infer<typeof bodySchema>): Promise<IngestedItem> {
  const normalizedUrl = normalizeFocusedUrl(postUrl);
  const sourceType = normalizedUrl ? getFocusedSourceType(normalizedUrl) : "general_social";
  const url = normalizedUrl || "https://x.com/hashtag/ASCOHype";
  const urlSummary = normalizedUrl ? await summarizeFocusedUrl(url, sourceType) : undefined;
  const title =
    urlSummary?.title ??
    (sourceType === "general_social"
      ? "Operator-focused X/social item for ASCO Hype"
      : "Operator-focused URL for ASCO Hype");
  const sourceName =
    sourceType === "general_social" ? "Operator-focused X/social item" : "Operator-focused URL";
  return {
    id: `focused-url-${Date.now()}`,
    title,
    url,
    excerpt: [
      urlSummary?.excerpt,
      postText?.trim() ? `Operator pasted text or tip: ${postText.trim()}` : "",
      operatorNote ? `Operator focus note: ${operatorNote}` : "",
      sourceType === "general_social"
        ? "This is an operator-selected X/social item. Treat as audience buzz until reviewed."
        : "This is an operator-selected URL. Treat it as a source for review before broadcast."
    ]
      .filter(Boolean)
      .join("\n"),
    sourceName,
    sourceType,
    rank: sourceType === "official" ? 1 : sourceType === "media" ? 2 : 5,
    publishedAt: new Date().toISOString()
  };
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const source = await buildFocusedSource(body);
    const social = source.sourceType.includes("social");
    const segment = await generateSegmentFromSources({
      sources: [source],
      personaId: "vesper-quill",
      hypeLevel: "high_energy",
      contentType: social ? "social_signal" : "media_roundup",
      editorialInstruction: [
        social
          ? "Create a short radio-DJ style social desk hit from this operator-focused X/social item."
          : "Create a short radio-DJ style source focus hit from this operator-focused URL.",
        "Make it sound exciting, but clearly label operator-selected items and keep them review-gated.",
        "Do not treat social posts, attendee tips, or scraped page summaries as verified fact unless a primary source is included.",
        "If the post recommends snacks, coffee, a booth, a poster, or a media hit, call it an attendee tip that requires review.",
        "Mention #ASCOHype as the routing tag for more audience tips."
      ].join("\n")
    });

    const savedSegments = await saveGeneratedSegmentsToDb([segment]);
    const savedSegment = savedSegments?.[0] ?? segment;

    return NextResponse.json({
      ok: true,
      segment: savedSegment,
      note:
        "Focused item created as a pending review segment. Approve it before broadcast."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
