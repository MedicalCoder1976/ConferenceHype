// Each voiced card is a high-energy-host segment (self-intro handled by
// formatVoiceSegment, then substantive narration of the card's topic),
// immediately followed by a 45-second music transition.
// 4 cards per block × (135s content + 45s music) × 5 blocks = 3,600s = 1 hour.
// 20 cards / 4 voices = 5 cards per voice section (equal sections).
//
// Raised from 16 cards/180s nominal on 2026-07-03: real cards were averaging
// only ~35s of actual narration (mostly honest-short template/weekly-batch
// cards, not padded fabrication), so the ~145s gap between nominal and actual
// was flowing into music per card, leaving 84-93% of the hour as music. The
// hourly card pool already gathers more real candidates than fit in 16 slots
// (excess is saved as "overflow" for a later hour), so pulling in more cards
// per hour uses material that already exists rather than stretching content.
//
// Bug found and fixed 2026-07-06: the 2026-07-03 change above raised the
// card count to 3 slots/block x 8 blocks = 24, but never rechecked that
// 24 x (135+45) = 4,320s -- 72 minutes, not 60. scheduledContentAt(index) and
// buildBroadcastSlots (lib/rundown/slots.ts) both reduce to a pure
// `hourStart + index * (CONTENT_SECONDS + MUSIC_SECONDS)` regardless of how
// CONTENT_SLOTS_PER_MUSIC_BLOCK/MUSIC_BLOCKS_PER_HOUR factor that count, so
// every index >= 20 landed at or past the 60-minute mark and got silently
// dropped by render-hour-broadcast.ts's `slot.at < baseTime + durationSeconds`
// filter -- never narrated, never even shown as a silent placeholder, just
// missing from the aired program. An operator filling all 24 nominal slots
// in "Presentation sequence" would see 24 cards arranged but only ~20 air.
// Fixed by changing the block factorization (3x8 -> 4x5) so the total is
// exactly 20, matching what 3,600s / 180s actually allows. Deliberately did
// NOT change CONTENT_SECONDS or MUSIC_SECONDS to make the math work (e.g.
// shrinking to 150s/pair) because scheduledContentAt(index) is pure
// `index * (CONTENT_SECONDS + MUSIC_SECONDS)`: changing that per-pair
// duration would have shifted the pinned timestamp of every already-approved
// card for every not-yet-aired hour, breaking their slot alignment. Changing
// only the block factorization leaves every index < 20's timestamp exactly
// where it already was; it only stops generating (and stops the admin batch
// endpoint from assigning) indices 20-23, which were never going to air
// anyway. See also CARDS_PER_VOICE_SECTION in lib/rundown/slots.ts (still
// evenly divides: 20/4 = 5).
export const CONTENT_SECONDS = 135;
export const MUSIC_SECONDS = 45;
export const CONTENT_SLOTS_PER_MUSIC_BLOCK = 4;
export const MUSIC_BLOCKS_PER_HOUR = 5;
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
