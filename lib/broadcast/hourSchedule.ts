// Each voiced card is a ~3-minute high-energy-host segment (self-intro
// handled by formatVoiceSegment, then substantive narration of the card's
// topic), immediately followed by a 45-second music transition.
// 2 cards per block × (180s content + 45s music) × 8 blocks = 3,600s = 1 hour.
// 16 cards / 4 voices = 4 cards per voice section (equal sections).
export const CONTENT_SECONDS = 180;
export const MUSIC_SECONDS = 45;
export const CONTENT_SLOTS_PER_MUSIC_BLOCK = 2;
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
