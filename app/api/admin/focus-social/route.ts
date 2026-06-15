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
  operatorNote: z.string().max(600).optional().or(z.literal("")),
  sponsorName: z.string().trim().max(160).optional().or(z.literal("")),
  itemType: z
    .enum(["x_tweet", "url", "statement", "sponsor_message", "emergency_message"])
    .default("url"),
  personaId: z.string().max(80).default("vesper-quill"),
  approveNow: z.boolean().default(false),
  repeatEveryHalfHour: z.boolean().default(false),
  repeatCount: z.number().int().min(1).max(12).default(1)
}).refine((body) => body.postUrl?.trim() || body.postText?.trim(), {
  message: "Add a URL, pasted text, or both before focusing for review."
}).refine((body) => body.itemType !== "sponsor_message" || Boolean(body.sponsorName?.trim()), {
  message: "Sponsor name is required for paid content."
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

function getFocusedPlatform(url: string) {
  if (/\b(x\.com|twitter\.com)\b/i.test(url)) {
    return "X";
  }
  if (/\b(instagram\.com|threads\.net)\b/i.test(url)) {
    return "Instagram";
  }
  return "";
}

function getFocusedSourceType(url: string): SourceType {
  if (getFocusedPlatform(url)) {
    return "general_social";
  }
  if (/\basco\.org\b|\bmeetings\.asco\.org\b/i.test(url)) {
    return "official";
  }
  return "media";
}

async function summarizeFocusedUrl(url: string, sourceType: SourceType) {
  const platform = getFocusedPlatform(url);
  const source: SourceConfig = {
    id: `focused-url-${Date.now()}`,
    name:
      sourceType === "general_social"
        ? `Operator-focused ${platform || "social"} URL`
        : "Operator-focused URL",
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
  operatorNote,
  sponsorName,
  itemType
}: z.infer<typeof bodySchema>): Promise<IngestedItem> {
  const normalizedUrl = normalizeFocusedUrl(postUrl);
  const sourceType =
    itemType === "statement" || itemType === "sponsor_message" || itemType === "emergency_message"
      ? "manual"
      : normalizedUrl
        ? getFocusedSourceType(normalizedUrl)
        : "general_social";
  const url = normalizedUrl || "https://x.com/hashtag/ConferenceHype";
  const urlSummary = normalizedUrl ? await summarizeFocusedUrl(url, sourceType) : undefined;
  const platform = getFocusedPlatform(url);
  const title =
    urlSummary?.title ??
    (sourceType === "general_social"
      ? `Operator-focused ${platform || "social"} item for ConferenceHype`
      : "Operator-focused URL for ConferenceHype");
  const sourceName =
    sourceType === "general_social"
      ? `Operator-focused ${platform || "social"} item`
      : "Operator-focused URL";
  return {
    id: `focused-url-${Date.now()}`,
    title,
    url,
    excerpt: [
      urlSummary?.excerpt,
      postText?.trim() ? `Operator pasted text or tip: ${postText.trim()}` : "",
      operatorNote ? `Operator focus note: ${operatorNote}` : "",
      itemType === "sponsor_message"
        ? `Paid content from ${sponsorName}. Read it as a clearly labeled sponsor message, not editorial reporting.`
        : "",
      itemType === "statement"
        ? "Operator marked this as a direct statement for broadcast."
        : "",
      itemType === "emergency_message"
        ? "Operator marked this as emergency content. Read the operator text clearly and directly."
        : "",
      sourceType === "general_social"
        ? `This is an operator-selected ${platform || "social"} item. Use only if it is a monitored X voice callout or has a source-backed citation. Do not broadcast vague audience chatter.`
        : "This is an operator-selected item. Keep source attribution clear before broadcast."
    ]
      .filter(Boolean)
      .join("\n"),
    sourceName,
    sourceType,
    rank: sourceType === "official" ? 1 : sourceType === "media" ? 2 : 5,
    publishedAt: new Date().toISOString()
  };
}

function repeatCopies<T extends { title: string; summary: string; script: string }>(
  segment: T,
  repeatEveryHalfHour: boolean,
  repeatCount: number
) {
  const total = repeatEveryHalfHour ? repeatCount : 1;
  const now = Date.now();
  return Array.from({ length: total }, (_, index) => {
    const scheduledAt = new Date(now + index * 30 * 60 * 1000).toISOString();
    const repeatLabel =
      total > 1 ? `Repeat ${index + 1} of ${total}; scheduled ${scheduledAt}.` : "";
    return {
      ...segment,
      title: total > 1 ? `${segment.title} (${index + 1}/${total})` : segment.title,
      summary: [segment.summary, repeatLabel].filter(Boolean).join(" "),
      script: [segment.script, repeatLabel ? `Operator repeat note: ${repeatLabel}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      approvedAt: scheduledAt,
      updatedAt: scheduledAt
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const source = await buildFocusedSource(body);
    const social = source.sourceType.includes("social");
    const isSponsor = body.itemType === "sponsor_message";
    const isEmergency = body.itemType === "emergency_message";
    const status = body.approveNow && !isSponsor ? "approved" : "pending_review";
    const generatedSegment = await generateSegmentFromSources({
      sources: [source],
      personaId: body.personaId,
      hypeLevel: "high_energy",
      contentType: isSponsor ? "industry_floor" : isEmergency ? "hype_clip" : social ? "social_signal" : "media_roundup",
      status,
      editorialInstruction: [
        isSponsor
          ? `Create a concise paid sponsor message for ${body.sponsorName}. The title and spoken script must explicitly say "Sponsored" or "Sponsor message". Keep it separate from editorial conference commentary and do not imply ConferenceHype endorsement.`
          : social
          ? "Create a short radio-DJ style social desk hit from this operator-focused X/Instagram/social item."
          : isEmergency
            ? "Create a concise emergency content read from the operator text. Label it as an operator update and read it clearly without hype filler."
          : body.itemType === "statement"
            ? "Create a concise operator statement for broadcast. Keep the wording clear, direct, and source-labeled."
            : "Create a short radio-DJ style source focus hit from this operator-focused URL.",
        "Make it sound exciting, but clearly label operator-selected items and keep them source-attributed.",
        "Do not use the words air, aired, airing, airtime, verified, or the phrase we verify in spoken copy.",
        "Every card should be able to start with any voice name followed by 'from ASCO' before the narrative.",
        "Do not create broadcast material from vague social chatter, snack tips, hallway energy, or audience tips unless the operator marked it as a direct statement or sponsor message.",
        "Only create a broadcast-ready card from source-attributed material, an article, a monitored X voice, an operator statement, or a sponsor message.",
        "Mention #ConferenceHype only as the routing tag for source-attributed broadcast ideas.",
        body.repeatEveryHalfHour
          ? `The operator requested this card repeat once every half hour for ${body.repeatCount} total reads.`
          : ""
      ].join("\n")
    });
    const segment = isSponsor
      ? {
          ...generatedSegment,
          title: `Sponsored: ${body.sponsorName} - ${generatedSegment.title}`,
          summary: `Paid sponsor message from ${body.sponsorName}. ${generatedSegment.summary}`,
          riskFlags: Array.from(
            new Set([...generatedSegment.riskFlags, "sponsor_message", "paid_content"])
          )
        }
      : generatedSegment;

    const segments = repeatCopies(
      segment,
      status === "approved" && body.repeatEveryHalfHour,
      body.repeatCount
    );
    const savedSegments = await saveGeneratedSegmentsToDb(segments);
    const savedSegment = savedSegments?.[0] ?? segment;

    return NextResponse.json({
      ok: true,
      segment: savedSegment,
      count: savedSegments?.length ?? segments.length,
      note:
        status === "approved"
          ? "Operator item added to the approved broadcast rundown."
          : isSponsor
            ? "Sponsor message created as paid content in human review. Approve it before placement."
            : "Focused item created as a pending review segment. Approve it before broadcast."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
