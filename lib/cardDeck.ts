import { conferenceLinkedSourceIds } from "@/lib/sources/socialLinks";
import type { MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";
import {
  sourceIdMatchesConference,
  sourceIdMatchesJournal,
  sourceIdsFromSegment
} from "@/lib/weeklySourceCards";
import { isEmptyConferenceInformationCard } from "@/lib/generation/validator";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import { contentSignature } from "@/lib/segments/contentSignature";

export type DeckCard = {
  segment: Segment;
};

export type EntityCardDeck = {
  total: number;
  cards: DeckCard[];
};

export const EMPTY_CARD_DECK: EntityCardDeck = {
  total: 0,
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
// Already-aired (status "rendered") cards are excluded here entirely --
// once a card has actually broadcast, it belongs in "Talked About"
// (components/AiredHistory.tsx, fed by getAiredSegmentsFromDb), not mixed
// back into the ready-to-schedule deck the operator is reviewing. Send a
// card back to its journal/conference/source for future re-presentation
// from that Talked About view (re-approves it, same as any other approval).
function buildDeck(segments: Segment[], matchesEntity: (sourceId: string) => boolean): EntityCardDeck {
  const matched = segments
    .filter(
      (segment) =>
        segment.status !== "rendered" &&
        isSubstantiveDeckCard(segment) &&
        sourceIdsFromSegment(segment).some(matchesEntity)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // dedupeSegments (above, called before this) only dedupes by segment id --
  // the weekly batch and the one-hour batch can each independently generate
  // their own separate segment row for the same underlying article (same
  // citation url, different ids). Confirmed live 2026-07-18: one JCO
  // Oncology Practice article had 44 separate segment rows, several still
  // pending review at once, which would otherwise render as many identical-
  // looking tiles in this deck. Dedupe by content, keeping the newest
  // (matched is already sorted newest-first above).
  const seenSignatures = new Set<string>();
  const cards = matched
    .filter((segment) => {
      const signature = contentSignature(segment);
      if (seenSignatures.has(signature)) {
        return false;
      }
      seenSignatures.add(signature);
      return true;
    })
    .map((segment) => ({ segment }));
  return { total: cards.length, cards };
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
