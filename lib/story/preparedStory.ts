import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { broadcastDisclaimer } from "@/lib/generation/disclaimers";
import type { Segment } from "@/lib/types";

export const storyInputSchema = z.object({
  title: z.string().trim().min(8).max(100),
  topic: z.string().trim().min(3).max(160),
  sourceUrl: z.string().url(),
  sourceName: z.string().trim().max(120).optional().default(""),
  articleTitle: z.string().trim().max(300).optional().default(""),
  authors: z.string().trim().max(500).optional().default(""),
  specialty: z.string().trim().max(80).optional().default("Story"),
  descriptionOpening: z.string().trim().min(40).max(500),
  thumbnailHeadline: z.string().trim().min(8).max(58),
  startsAt: z.string().datetime().optional(),
  narrative: z.string().trim().min(1_200).max(120_000)
});

export type StoryInput = z.infer<typeof storyInputSchema>;

const STORY_CARD_COUNT = 12;
const STORY_TRANSITION_SECONDS = 15;
const STORY_WORDS_PER_SECOND_AT_MEASURED_PACE = 1.95;

function cleanNarrative(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

// Decimal points (e.g. "0.783", "85.7%") read as sentence-ending periods to the
// naive [.!?] splitter below, corrupting card boundaries and title extraction --
// worst case, splicing the auto-inserted disclaimer mid-number in the narration.
// Mask digit.digit periods before splitting, restore them after.
const DECIMAL_MASK = "";
function maskDecimalPoints(value: string) {
  return value.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MASK}$2`);
}
function unmaskDecimalPoints(value: string) {
  return value.split(DECIMAL_MASK).join(".");
}

function splitEvenly(value: string, count: number) {
  const tokens = words(value);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((tokens.length * index) / count);
    const end = Math.floor((tokens.length * (index + 1)) / count);
    return tokens.slice(start, end).join(" ");
  });
}

function storyCards(value: string) {
  const cleaned = cleanNarrative(value);
  const tokenCount = words(cleaned).length;
  if (tokenCount < 420) {
    throw new Error("The story needs at least 420 spoken words so the broadcast has 12 substantive narrative cards.");
  }
  const sentences = maskDecimalPoints(cleaned).match(/[^.!?]+[.!?]+(?:[\"'”’]+)?|[^.!?]+$/g)?.map((sentence) => unmaskDecimalPoints(sentence.trim())).filter(Boolean) ?? [];
  if (sentences.length < STORY_CARD_COUNT) return splitEvenly(cleaned, STORY_CARD_COUNT);
  const targetWords = tokenCount / STORY_CARD_COUNT;
  const cards: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const sentence of sentences) {
    const remainingCards = STORY_CARD_COUNT - cards.length;
    const sentenceWords = words(sentence).length;
    if (current.length && currentWords + sentenceWords > targetWords && remainingCards > 1) {
      cards.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += sentenceWords;
  }
  if (current.length) cards.push(current.join(" "));
  if (cards.length !== STORY_CARD_COUNT) return splitEvenly(cleaned, STORY_CARD_COUNT);
  return cards;
}

function cardTitle(text: string, index: number) {
  const firstSentenceMasked = maskDecimalPoints(text).match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? maskDecimalPoints(text);
  const firstSentence = unmaskDecimalPoints(firstSentenceMasked);
  const title = firstSentence.replace(/[.!?]+$/, "").trim();
  if (!title) return `Story chapter ${index + 1}`;
  return title.length <= 72 ? title : `${title.slice(0, 71).trimEnd()}…`;
}

export function parsePreparedStory(input: StoryInput) {
  const parsed = storyInputSchema.parse(input);
  const cards = storyCards(parsed.narrative);
  const spokenWords = cards.reduce((sum, card) => sum + words(card).length, 0);
  const transitionSeconds = Math.floor((cards.length - 1) / 3) * STORY_TRANSITION_SECONDS;
  const durationSeconds = Math.max(300, Math.ceil((spokenWords / STORY_WORDS_PER_SECOND_AT_MEASURED_PACE + transitionSeconds + 45) / 15) * 15);
  const sourceHash = createHash("sha256").update(JSON.stringify({ ...parsed, startsAt: undefined, narrative: cleanNarrative(parsed.narrative) })).digest("hex");
  return {
    input: parsed,
    cards: cards.map((script, index) => ({ position: index + 1, title: cardTitle(script, index), script })),
    spokenWords,
    durationSeconds,
    sourceHash
  };
}

export function preparedStorySegments(story: ReturnType<typeof parsePreparedStory>): Segment[] {
  const now = new Date().toISOString();
  let sequence = 0;
  const makeSegment = (title: string, script: string, flags: string[]): Segment => {
    sequence += 1;
    return {
      id: `draft-${randomUUID()}`,
      title,
      summary: script,
      script,
      contentType: "media_roundup",
      personaId: "luna-vale",
      personaName: "Luna Vale",
      hypeLevel: "restrained",
      language: "English",
      status: "approved",
      citations: [{ label: [story.input.sourceName, story.input.articleTitle].filter(Boolean).join(": ") || `${story.input.topic}: primary source`, url: story.input.sourceUrl, sourceType: "media" }],
      socialBuzzItems: [],
      riskFlags: ["meeting_watch", "prepared_narrative", "prepared_story", `prepared_sequence:${String(sequence).padStart(4, "0")}`, ...flags],
      confidenceScore: 90,
      createdAt: now,
      approvedAt: now,
      updatedAt: now
    };
  };
  const result: Segment[] = [];
  for (const card of story.cards) {
    const transition = card.position === 6
      ? [`prepared_transition:${STORY_TRANSITION_SECONDS}`]
      : [];
    result.push(makeSegment(card.title, card.script, [
      `prepared_card:${card.position}`,
      ...(card.position === 1 ? ["prepared_opening", `prepared_thumbnail:${story.input.thumbnailHeadline}`] : []),
      ...transition
    ]));
    if (card.position === 6) {
      result.push(makeSegment("Important ConferenceHype notice", broadcastDisclaimer, ["prepared_disclaimer", "prepared_card:6.5"]));
    }
  }
  result.push(makeSegment(
    "The story in perspective",
    `That is the story of ${story.input.topic}. Add your perspective in the comments, share this story with a colleague, and subscribe for the next ConferenceHype narrative.`,
    ["prepared_closing", `prepared_card:${story.cards.length + 1}`]
  ));
  return result;
}
