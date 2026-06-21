export const CONTENT_SECONDS = 40;
export const MUSIC_SECONDS = 20;
export const CONTENT_SLOTS_PER_MUSIC_BLOCK = 5;
export const MUSIC_BLOCKS_PER_HOUR = 12;
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
