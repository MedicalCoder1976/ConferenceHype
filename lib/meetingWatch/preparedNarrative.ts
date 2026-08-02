import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Segment } from "@/lib/types";

const turnSchema = z.object({ speaker: z.enum(["HOST_1", "HOST_2"]), text: z.string().trim().min(1) });
const packageSchema = z.object({
  schema_version: z.literal("conferencehype_prepared_broadcast_v1"), status: z.literal("ready"),
  content_type: z.enum(["INDIVIDUAL_RESEARCH", "REVIEW_ARTICLE", "CONFERENCE_ROUNDUP", "OPINION_COMMENTARY", "TREATMENT_ALGORITHM"]),
  source: z.object({ publication: z.string().trim().min(1), article_title: z.string().trim().min(1), url: z.string().url(), publication_date: z.string().optional().default(""), authors: z.array(z.string()).optional().default([]) }),
  program: z.object({ conference_name: z.string().optional().default(""), specialty: z.string().optional().default(""), title: z.string().trim().min(1).max(150), thumbnail_headline: z.string().trim().min(1), description_opening: z.string().trim().min(1), studies_covered: z.array(z.string()).default([]), estimated_spoken_words: z.number().optional(), estimated_duration_minutes: z.number().optional(), recommended_presenter_format: z.string().optional() }),
  opening_hook: z.object({ visible_text: z.string().trim().min(1), speaker_turns: z.array(turnSchema).min(1), source_anchor: z.string().trim().min(1) }),
  cards: z.array(z.object({ position: z.number().int().positive(), title: z.string().trim().min(1), card_type: z.string().trim().min(1), visible_text: z.string().trim().min(1), speaker_turns: z.array(turnSchema).min(1), source_anchor: z.string().trim().min(1), study_name: z.string().optional().default(""), reported_numbers: z.array(z.string()).optional().default([]), limitations: z.array(z.string()).optional().default([]) })).min(6),
  transitions: z.array(z.object({ after_card_position: z.number().int().positive(), duration_seconds: z.number().int().min(10).max(60), next_topic: z.string().default("") })).default([]),
  disclaimer: z.object({ after_card_position: z.number().int().nonnegative(), text: z.string().trim().min(1) }),
  closing: z.object({ speaker_turns: z.array(turnSchema).min(1) }),
  chapters: z.array(z.object({ card_position: z.number().int().positive(), title: z.string().trim().min(1) })).default([]),
  youtube_tags: z.array(z.string()).default([]), quality_report: z.record(z.string(), z.unknown()).optional()
});
export type PreparedNarrativePackage = z.infer<typeof packageSchema>;

export function parsePreparedNarrative(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON broadcast package was found.");
  const parsed = packageSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  const positions = parsed.cards.map((card) => card.position);
  if (new Set(positions).size !== positions.length) throw new Error("Card positions must be unique.");
  const positionOrdered = [...parsed.cards].sort((a, b) => a.position - b.position);
  const conversations = new Map<string, typeof positionOrdered>();
  const conversationKeyByOldPosition = new Map<number, string>();
  for (const card of positionOrdered) {
    const normalizedStudy = card.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const conversationKey = normalizedStudy ? `study:${normalizedStudy}` : `standalone:${card.position}`;
    conversationKeyByOldPosition.set(card.position, conversationKey);
    const conversation = conversations.get(conversationKey) ?? [];
    conversation.push(card);
    conversations.set(conversationKey, conversation);
  }
  const groupedCards = [...conversations.values()].flat();
  const trialOrderNormalized = groupedCards.some((card, index) => card.position !== positionOrdered[index]?.position);
  const newPositionByOld = new Map(groupedCards.map((card, index) => [card.position, index + 1]));
  const lastPositionByConversation = new Map<string, number>();
  groupedCards.forEach((card, index) => {
    const key = conversationKeyByOldPosition.get(card.position);
    if (key) lastPositionByConversation.set(key, index + 1);
  });
  const remapConversationBoundary = (oldPosition: number) => {
    const key = conversationKeyByOldPosition.get(oldPosition);
    if (key?.startsWith("study:")) return lastPositionByConversation.get(key) ?? newPositionByOld.get(oldPosition) ?? oldPosition;
    return newPositionByOld.get(oldPosition) ?? oldPosition;
  };
  parsed.cards = groupedCards.map((card, index) => ({ ...card, position: index + 1 }));
  const transitionByBoundary = new Map<number, (typeof parsed.transitions)[number]>();
  for (const transition of parsed.transitions) {
    const boundary = remapConversationBoundary(transition.after_card_position);
    const existing = transitionByBoundary.get(boundary);
    transitionByBoundary.set(boundary, existing && existing.duration_seconds >= transition.duration_seconds ? existing : { ...transition, after_card_position: boundary });
  }
  parsed.transitions = [...transitionByBoundary.values()].sort((a, b) => a.after_card_position - b.after_card_position);
  parsed.disclaimer.after_card_position = remapConversationBoundary(parsed.disclaimer.after_card_position);
  parsed.chapters = parsed.chapters
    .map((chapter) => ({ ...chapter, card_position: newPositionByOld.get(chapter.card_position) ?? chapter.card_position }))
    .sort((a, b) => a.card_position - b.card_position);
  const spokenWords = [...parsed.opening_hook.speaker_turns, ...parsed.cards.flatMap((card) => card.speaker_turns), ...parsed.closing.speaker_turns].reduce((sum, turn) => sum + turn.text.trim().split(/\s+/).length, 0);
  const transitionSeconds = parsed.transitions.reduce((sum, item) => sum + item.duration_seconds, 0);
  const disclaimerWords = parsed.disclaimer.text.trim().split(/\s+/).length;
  const estimatedSeconds = Math.ceil((spokenWords + disclaimerWords) / 2.1) + transitionSeconds + 15;
  const durationSeconds = Math.max(300, Math.min(7200, Math.ceil(estimatedSeconds / 15) * 15));
  const sourceHash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return { package: parsed, spokenWords, transitionSeconds, durationSeconds, sourceHash, trialOrderNormalized, preambleRemoved: raw.slice(0, start).trim().length > 0 };
}

const HOSTS = { HOST_1: { id: "echo-sage", name: "TumorCrusher" }, HOST_2: { id: "luna-vale", name: "Luna Vale" } } as const;

// Same fix as evidenceDashboard.ts's stripSlideDescriptors (2026-07-30): these
// patterns are meant to strip a leading label/host prefix only. Unanchored,
// they also deleted the same words when they legitimately occurred mid-text
// -- here that risk is worse than a slide title, since this runs on spoken
// narration (e.g. "...concludes our journal coverage for today" would have
// silently lost "journal coverage" from the audio script).
function stripPreparedDescriptors(value: string) {
  return value
    .replace(/^(?:Tumor\s*Crusher|Luna Vale)\b\s*(?:\/|:|-)?\s*/gi, "")
    .replace(/^(?:Media Watch|Pharma Watch|Journal Coverage|Conference Coverage)\s*[:\-–—]?\s*/gi, "")
    .replace(/^A new ASCO Educational Book review\b\s*[:\-–—]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function openingAttribution(pkg: PreparedNarrativePackage) {
  const authorText = pkg.source.authors.length
    ? ` by ${pkg.source.authors.join(", ")}`
    : "";
  return `We are reviewing "${pkg.source.article_title}"${authorText}, published in ${pkg.source.publication}.`;
}
export function preparedNarrativeSegments(pkg: PreparedNarrativePackage): Segment[] {
  const now = new Date().toISOString();
  let sequence = 0;
  const result: Segment[] = [];
  const pushTurns = (turns: Array<z.infer<typeof turnSchema>>, input: { title: string; visibleText: string; sourceAnchor: string; flags: string[]; transitionSeconds?: number }) => {
    turns.forEach((turn, turnIndex) => {
      const host = HOSTS[turn.speaker];
      sequence += 1;
      result.push({
        id: `draft-${randomUUID()}`, title: stripPreparedDescriptors(input.title), summary: stripPreparedDescriptors(input.visibleText), script: input.flags.includes("prepared_disclaimer") ? stripPreparedDescriptors(turn.text) : stripPreparedDescriptors(turn.text).replaceAll(pkg.disclaimer.text, "").trim(),
        contentType: "media_roundup", personaId: host.id, personaName: host.name, hypeLevel: "restrained", language: "English", status: "approved",
        citations: [{ label: `${pkg.source.publication}: ${pkg.source.article_title}${pkg.source.authors.length ? ` - ${pkg.source.authors.join(", ")}` : ""}`, url: pkg.source.url, sourceType: "media" }], socialBuzzItems: [],
        riskFlags: ["meeting_watch", "prepared_narrative", `prepared_sequence:${String(sequence).padStart(4, "0")}`, `source_anchor:${input.sourceAnchor.slice(0, 180)}`, ...input.flags, ...(turnIndex === turns.length - 1 && input.transitionSeconds ? [`prepared_transition:${input.transitionSeconds}`] : [])],
        confidenceScore: 95, createdAt: now, approvedAt: now, updatedAt: now
      });
    });
  };
  const openingTurns = pkg.opening_hook.speaker_turns.map((turn, index) => ({
    ...turn,
    text: index === 0
      ? `${openingAttribution(pkg)} ${stripPreparedDescriptors(turn.text)}`
      : stripPreparedDescriptors(turn.text)
  }));
  pushTurns(openingTurns, { title: pkg.program.thumbnail_headline, visibleText: pkg.opening_hook.visible_text, sourceAnchor: pkg.opening_hook.source_anchor, flags: ["prepared_opening", "prepared_card:0"] });
  for (const [cardIndex, card] of pkg.cards.entries()) {
    const studyKey = card.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const nextStudyKey = pkg.cards[cardIndex + 1]?.study_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
    const transition = studyKey && studyKey === nextStudyKey ? undefined : pkg.transitions.find((item) => item.after_card_position === card.position)?.duration_seconds;
    pushTurns(card.speaker_turns, { title: card.title, visibleText: card.visible_text, sourceAnchor: card.source_anchor, flags: [`prepared_card:${card.position}`, `prepared_type:${card.card_type}`, ...(studyKey ? [`prepared_study:${studyKey}`] : [])], transitionSeconds: transition });
    if (pkg.disclaimer.after_card_position === card.position) pushTurns([{ speaker: "HOST_1", text: pkg.disclaimer.text }], { title: "Important ConferenceHype notice", visibleText: pkg.disclaimer.text, sourceAnchor: "Prepared broadcast disclaimer", flags: ["prepared_disclaimer", `prepared_card:${card.position}.5`] });
  }
  pushTurns(pkg.closing.speaker_turns, { title: "What the evidence leaves unanswered", visibleText: "The ConferenceHype deep dive concludes with the principal finding, limitations, and the most important unanswered question.", sourceAnchor: "Prepared narrative closing synthesis", flags: ["prepared_closing", `prepared_card:${pkg.cards.length + 1}`] });
  return result;
}
