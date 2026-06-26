// Each voiced card is a full ~6-minute high-energy-host segment (self-intro
// handled by formatVoiceSegment, then substantive narration of the card's
// topic), immediately followed by a music transition -- the music ending is
// the cue for the next card. 360 + 90 = 450s per card, x 8 cards = exactly
// one hour, and 8 is divisible by VOICES_PER_HOUR (4) in lib/rundown/slots.ts
// so each hour's 4 voices still get an equal number of cards.
export const CONTENT_SECONDS = 360;
export const MUSIC_SECONDS = 90;
export const CONTENT_SLOTS_PER_MUSIC_BLOCK = 1;
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
