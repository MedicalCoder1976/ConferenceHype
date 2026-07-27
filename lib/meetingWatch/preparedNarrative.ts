import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Segment } from "@/lib/types";

const turnSchema = z.object({ speaker: z.enum(["HOST_1", "HOST_2"]), text: z.string().trim().min(1) });
const packageSchema = z.object({
  schema_version: z.literal("conferencehype_prepared_broadcast_v1"), status: z.literal("ready"),
  content_type: z.enum(["INDIVIDUAL_RESEARCH", "REVIEW_ARTICLE", "CONFERENCE_ROUNDUP"]),
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
  parsed.cards.sort((a, b) => a.position - b.position);
  const spokenWords = [...parsed.opening_hook.speaker_turns, ...parsed.cards.flatMap((card) => card.speaker_turns), ...parsed.closing.speaker_turns].reduce((sum, turn) => sum + turn.text.trim().split(/\s+/).length, 0);
  const transitionSeconds = parsed.transitions.reduce((sum, item) => sum + item.duration_seconds, 0);
  const disclaimerWords = parsed.disclaimer.text.trim().split(/\s+/).length;
  const estimatedSeconds = Math.ceil((spokenWords + disclaimerWords) / 2.1) + transitionSeconds + 15;
  const durationSeconds = Math.max(300, Math.min(7200, Math.ceil(estimatedSeconds / 15) * 15));
  const sourceHash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return { package: parsed, spokenWords, transitionSeconds, durationSeconds, sourceHash, preambleRemoved: raw.slice(0, start).trim().length > 0 };
}

const HOSTS = { HOST_1: { id: "echo-sage", name: "TumorCrusher" }, HOST_2: { id: "luna-vale", name: "Luna Vale" } } as const;
export function preparedNarrativeSegments(pkg: PreparedNarrativePackage): Segment[] {
  const now = new Date().toISOString();
  let sequence = 0;
  const result: Segment[] = [];
  const pushTurns = (turns: Array<z.infer<typeof turnSchema>>, input: { title: string; visibleText: string; sourceAnchor: string; flags: string[]; transitionSeconds?: number }) => {
    turns.forEach((turn, turnIndex) => {
      const host = HOSTS[turn.speaker];
      sequence += 1;
      result.push({
        id: `draft-${randomUUID()}`, title: input.title, summary: input.visibleText, script: turn.text,
        contentType: "media_roundup", personaId: host.id, personaName: host.name, hypeLevel: "restrained", language: "English", status: "approved",
        citations: [{ label: `${pkg.source.publication}: ${pkg.source.article_title}`, url: pkg.source.url, sourceType: "media" }], socialBuzzItems: [],
        riskFlags: ["meeting_watch", "prepared_narrative", `prepared_sequence:${String(sequence).padStart(4, "0")}`, `source_anchor:${input.sourceAnchor.slice(0, 180)}`, ...input.flags, ...(turnIndex === turns.length - 1 && input.transitionSeconds ? [`prepared_transition:${input.transitionSeconds}`] : [])],
        confidenceScore: 95, createdAt: now, approvedAt: now, updatedAt: now
      });
    });
  };
  pushTurns(pkg.opening_hook.speaker_turns, { title: pkg.program.thumbnail_headline, visibleText: pkg.opening_hook.visible_text, sourceAnchor: pkg.opening_hook.source_anchor, flags: ["prepared_opening", "prepared_card:0"] });
  for (const card of pkg.cards) {
    const transition = pkg.transitions.find((item) => item.after_card_position === card.position)?.duration_seconds;
    pushTurns(card.speaker_turns, { title: card.title, visibleText: card.visible_text, sourceAnchor: card.source_anchor, flags: [`prepared_card:${card.position}`, `prepared_type:${card.card_type}`], transitionSeconds: transition });
    if (pkg.disclaimer.after_card_position === card.position) pushTurns([{ speaker: "HOST_1", text: pkg.disclaimer.text }], { title: "Important ConferenceHype notice", visibleText: pkg.disclaimer.text, sourceAnchor: "Prepared broadcast disclaimer", flags: ["prepared_disclaimer", `prepared_card:${card.position}.5`] });
  }
  pushTurns(pkg.closing.speaker_turns, { title: "What the evidence leaves unanswered", visibleText: "The ConferenceHype deep dive concludes with the principal finding, limitations, and the most important unanswered question.", sourceAnchor: "Prepared narrative closing synthesis", flags: ["prepared_closing", `prepared_card:${pkg.cards.length + 1}`] });
  return result;
}
