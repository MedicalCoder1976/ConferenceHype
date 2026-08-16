import { normalizeJournalPublicationDate } from "@/lib/station/journalCadence";
import type { OncologyJournal, Segment } from "@/lib/types";

export const REGIONAL_PROGRAM_CARD_COUNT = 12;

function publicationDate(segment: Segment) {
  return segment.citations.map((citation) => normalizeJournalPublicationDate(citation.publishedAt)).filter(Boolean).sort().at(-1) ?? "";
}

export function selectRegionalJournalCards({
  segments,
  journals,
  releaseDate,
  excludedCardIds = [],
  maximumAgeDays = 35,
  cardCount = REGIONAL_PROGRAM_CARD_COUNT
}: {
  segments: Segment[];
  journals: OncologyJournal[];
  releaseDate: string;
  excludedCardIds?: string[];
  maximumAgeDays?: number;
  cardCount?: number;
}) {
  const journalIds = new Set(journals.map((journal) => journal.id));
  const excluded = new Set(excludedCardIds);
  const cutoff = new Date(`${releaseDate}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - maximumAgeDays);
  const oldest = cutoff.toISOString().slice(0, 10);
  const byJournal = new Map<string, Segment[]>();
  for (const segment of segments) {
    if (excluded.has(segment.id)) continue;
    const journalId = segment.citations.find((citation) => citation.journalId && journalIds.has(citation.journalId))?.journalId;
    if (!journalId) continue;
    const published = publicationDate(segment);
    if (!published || published >= releaseDate || published < oldest) continue;
    const current = byJournal.get(journalId) ?? [];
    current.push(segment);
    byJournal.set(journalId, current);
  }
  for (const cards of byJournal.values()) cards.sort((left, right) => publicationDate(right).localeCompare(publicationDate(left)) || left.id.localeCompare(right.id));
  const orderedJournals = journals.filter((journal) => byJournal.has(journal.id));
  const selected: Segment[] = [];
  for (let round = 0; selected.length < cardCount; round += 1) {
    let added = false;
    for (const journal of orderedJournals) {
      const candidate = byJournal.get(journal.id)?.[round];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length === cardCount) break;
    }
    if (!added) break;
  }
  return selected.length === cardCount ? selected : [];
}
