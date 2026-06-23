import { conferenceLinkedSourceIds } from "@/lib/sources/socialLinks";
import type { MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";
import {
  sourceIdMatchesConference,
  sourceIdMatchesJournal,
  sourceIdsFromSegment
} from "@/lib/weeklySourceCards";

export type DeckCard = {
  segment: Segment;
  presented: boolean;
};

export type EntityCardDeck = {
  total: number;
  presentedCount: number;
  notPresentedCount: number;
  cards: DeckCard[];
};

export const EMPTY_CARD_DECK: EntityCardDeck = {
  total: 0,
  presentedCount: 0,
  notPresentedCount: 0,
  cards: []
};

function dedupeSegments(segments: Segment[]) {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    if (seen.has(segment.id)) {
      return false;
    }
    seen.add(segment.id);
    return true;
  });
}

// Newest first, so older weeks' cards sink to the bottom of the deck.
function buildDeck(segments: Segment[], matchesEntity: (sourceId: string) => boolean): EntityCardDeck {
  const cards = segments
    .filter((segment) => sourceIdsFromSegment(segment).some(matchesEntity))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((segment) => ({ segment, presented: segment.status === "rendered" }));
  const presentedCount = cards.filter((card) => card.presented).length;
  return {
    total: cards.length,
    presentedCount,
    notPresentedCount: cards.length - presentedCount,
    cards
  };
}

export function buildConferenceCardDecks(
  allSegments: Segment[],
  conferences: Pick<MedicalConference, "id" | "acronym">[],
  sources: Pick<SourceConfig, "id">[] = []
): Record<string, EntityCardDeck> {
  const segments = dedupeSegments(allSegments);
  const decks: Record<string, EntityCardDeck> = {};
  for (const conference of conferences) {
    // A conference's own deck absorbs cards from its linked official
    // sub-pages (program, abstract library, etc.) — those sub-pages are not
    // shown as independent newspaper tiles, so their cards must count here.
    const linkedIds = new Set(
      conferenceLinkedSourceIds(conference, sources).map((source) => source.id)
    );
    decks[conference.id] = buildDeck(
      segments,
      (sourceId) => sourceIdMatchesConference(sourceId, conference) || linkedIds.has(sourceId)
    );
  }
  return decks;
}

export function buildJournalCardDecks(
  allSegments: Segment[],
  journals: Pick<OncologyJournal, "id">[]
): Record<string, EntityCardDeck> {
  const segments = dedupeSegments(allSegments);
  const decks: Record<string, EntityCardDeck> = {};
  for (const journal of journals) {
    decks[journal.id] = buildDeck(segments, (sourceId) => sourceIdMatchesJournal(sourceId, journal));
  }
  return decks;
}

export function buildSourceCardDecks(
  allSegments: Segment[],
  sources: Pick<SourceConfig, "id">[]
): Record<string, EntityCardDeck> {
  const segments = dedupeSegments(allSegments);
  const decks: Record<string, EntityCardDeck> = {};
  for (const source of sources) {
    decks[source.id] = buildDeck(segments, (sourceId) => sourceId === source.id);
  }
  return decks;
}
