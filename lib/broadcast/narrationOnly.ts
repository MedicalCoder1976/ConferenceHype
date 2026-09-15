import engagement from "./engagement.json";

export const BROADCAST_ENGAGEMENT = engagement.en;
export const CLOSING_FLAGS = ["prepared_closing", "journal_show_outro", "weekend_roundup_outro", "meeting_watch_outro", "narrative_engagement"];

type NarrationCard = {
  isMusic: boolean; duration: number; script?: string | null; text: string;
  title?: string; personaId?: string; segmentId?: string; voiceAudioPath?: string;
  gapClipPath?: string; sourceLabel?: string; sourceUrl?: string; riskFlags?: string[];
};

/** Remove scheduling fillers before TTS. One consistent narrated closing ends every edition. */
export function prepareNarrationOnlyCards<T extends NarrationCard>(input: T[]): T[] {
  const cards = input.filter(card => !card.isMusic && card.script?.trim() &&
    !card.riskFlags?.some(flag => CLOSING_FLAGS.includes(flag)))
    .map(card => ({ ...card, gapClipPath: undefined, personaId: card.personaId || "echo-sage" }));
  if (!cards.length) throw new Error("No substantive narration remains; refusing to create an engagement-only broadcast.");
  const last = cards[cards.length - 1];
  const closing = {
    ...last, segmentId: undefined, sourceLabel: undefined, sourceUrl: undefined,
    voiceAudioPath: undefined, gapClipPath: undefined, isMusic: false,
    title: "Share your requests Â· Like and subscribe", text: BROADCAST_ENGAGEMENT,
    script: BROADCAST_ENGAGEMENT, duration: BROADCAST_ENGAGEMENT.split(/\s+/).length / 1.95,
    riskFlags: [...(last.riskFlags ?? []).filter(flag => ["prepared_story", "meeting_watch_five_news"].includes(flag)), "prepared_closing", "narrative_engagement"]
  } as T;
  return [...cards, closing];
}

export function assertNarrationOnlyCards(cards: NarrationCard[]) {
  if (!cards.length || cards.some(card => card.isMusic || !card.script?.trim())) {
    throw new Error("Narration-only policy failed: every rendered card must contain speech and no music.");
  }
  if (cards.at(-1)?.script !== BROADCAST_ENGAGEMENT) {
    throw new Error("Narration-only policy failed: the required engagement closing is missing.");
  }
}
