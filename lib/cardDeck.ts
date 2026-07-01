import { conferenceLinkedSourceIds } from "@/lib/sources/socialLinks";
import type { MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";
import {
  sourceIdMatchesConference,
  sourceIdMatchesJournal,
  sourceIdsFromSegment
} from "@/lib/weeklySourceCards";
import { isEmptyConferenceInformationCard } from "@/lib/generation/validator";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";

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

// Announcement/fallback cards and empty metadata shells are never useful to
// show in the admin deck — they clutter the operator's view and are never
// schedulable anyway. Both types are excluded here rather than in individual
// call-sites so the rule is enforced uniformly across conference, journal,
// and source decks.
function isSubstantiveDeckCard(segment: Segment) {
  // Weekly context/announcement cards: "no new tracked articles this week",
  // "no new attributed items this week", etc. These are placeholder cards
  // that exist only so the weekly batch has something to fall back on; they
  // should never surface to the operator as real content.
  if (segment.riskFlags.includes("weekly_source_context")) {
    return false;
  }
  // Conference-admin/program/registration shells (dates, location, topics-in-
  // focus pages, guidelines pages, etc.) — same predicate as the broadcast
  // validator's isEmptyConferenceInformationCard so any card that can't be
  // scheduled for these reasons also won't clutter the deck view.
  if (isEmptyConferenceInformationCard(segment)) {
    return false;
  }
  // Cards that explicitly admit they have missing content ("The batch item did
  // not include enough summary detail", "I am sorry, I cannot", etc.) — these
  // are blocked from pendingSegments/nextBroadcastSegments by
  // filterBroadcastReadySegments but old aired copies could still surface here.
  const text = `${segment.title}\n${segment.summary}\n${segment.script}`;
  if (hasMissingIntakeFailureLanguage(text)) {
    return false;
  }
  return true;
}

// Newest first, so older weeks' cards sink to the bottom of the deck.
function buildDeck(segments: Segment[], matchesEntity: (sourceId: string) => boolean): EntityCardDeck {
  const cards = segments
    .filter((segment) => isSubstantiveDeckCard(segment) && sourceIdsFromSegment(segment).some(matchesEntity))
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
  conferences: Pick<MedicalConference, "id" | "acronym" | "year">[],
  sources: Pick<SourceConfig, "id" | "name">[] = []
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
