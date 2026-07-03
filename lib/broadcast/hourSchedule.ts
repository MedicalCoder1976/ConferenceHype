// Each voiced card is a high-energy-host segment (self-intro handled by
// formatVoiceSegment, then substantive narration of the card's topic),
// immediately followed by a 45-second music transition.
// 3 cards per block × (135s content + 45s music) × 8 blocks = 3,600s = 1 hour.
// 24 cards / 4 voices = 6 cards per voice section (equal sections).
//
// Raised from 16 cards/180s nominal on 2026-07-03: real cards were averaging
// only ~35s of actual narration (mostly honest-short template/weekly-batch
// cards, not padded fabrication), so the ~145s gap between nominal and actual
// was flowing into music per card, leaving 84-93% of the hour as music. The
// hourly card pool already gathers more real candidates than fit in 16 slots
// (excess is saved as "overflow" for a later hour), so pulling in more cards
// per hour uses material that already exists rather than stretching content.
export const CONTENT_SECONDS = 135;
export const MUSIC_SECONDS = 45;
export const CONTENT_SLOTS_PER_MUSIC_BLOCK = 3;
export const MUSIC_BLOCKS_PER_HOUR = 8;
export const CONTENT_CARDS_PER_HOUR =
  CONTENT_SLOTS_PER_MUSIC_BLOCK * MUSIC_BLOCKS_PER_HOUR;

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

export function scheduledContentAt(startsAt: string, index: number) {
  const start = new Date(startsAt);
  const block = Math.floor(index / CONTENT_SLOTS_PER_MUSIC_BLOCK);
  const position = index % CONTENT_SLOTS_PER_MUSIC_BLOCK;
  const blockStart = addSeconds(
    start,
    block * (CONTENT_SLOTS_PER_MUSIC_BLOCK * (CONTENT_SECONDS + MUSIC_SECONDS))
  );
  return addSeconds(blockStart, position * (CONTENT_SECONDS + MUSIC_SECONDS)).toISOString();
}
