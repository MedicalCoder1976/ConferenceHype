import type { EntityCardDeck } from "@/lib/cardDeck";
import type { OncologyJournal } from "@/lib/types";

export const TOP_JOURNAL_RELEASE_CADENCE = [
  "Nature Medicine", "European Heart Journal", "JAMA", "Circulation",
  "The New England Journal of Medicine", "Blood", "The Lancet",
  "Journal of Clinical Oncology", "Journal of the American College of Cardiology",
  "JAMA", "Journal of Clinical Oncology", "The New England Journal of Medicine",
  "The Lancet Oncology", "The Lancet"
] as const;

export const TOP_JOURNAL_FALLBACK_ORDER = [
  "The New England Journal of Medicine", "JAMA", "The Lancet",
  "Journal of Clinical Oncology", "Journal of the American College of Cardiology",
  "Circulation", "European Heart Journal", "Blood", "The Lancet Oncology",
  "JAMA Oncology", "Annals of Oncology", "Nature Medicine", "Cancer Discovery", "Cancer Cell"
] as const;

const CADENCE_ANCHOR = "2026-08-03";
const MAX_ARTICLE_AGE_DAYS = 8;

function weekdayReleaseIndex(targetDate: string) {
  const start = new Date(`${CADENCE_ANCHOR}T12:00:00Z`);
  const target = new Date(`${targetDate}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) throw new Error(`Invalid station date: ${targetDate}`);
  const direction = target >= start ? 1 : -1;
  let index = 0;
  for (const cursor = new Date(start); cursor.getTime() !== target.getTime(); cursor.setUTCDate(cursor.getUTCDate() + direction)) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + direction);
    const day = next.getUTCDay();
    if (day >= 1 && day <= 5) index += direction;
  }
  return ((index % TOP_JOURNAL_RELEASE_CADENCE.length) + TOP_JOURNAL_RELEASE_CADENCE.length) % TOP_JOURNAL_RELEASE_CADENCE.length;
}

function articleDate(card: EntityCardDeck["cards"][number]) {
  const published = card.segment.citations.map((citation) => citation.publishedAt).filter(Boolean).sort().at(-1);
  return (published ?? card.segment.createdAt).slice(0, 10);
}

export function eligibleNextDayDeck(deck: EntityCardDeck | undefined, targetDate: string): EntityCardDeck {
  const cutoff = new Date(`${targetDate}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - MAX_ARTICLE_AGE_DAYS);
  const oldest = cutoff.toISOString().slice(0, 10);
  const cards = (deck?.cards ?? []).filter((card) => {
    const date = articleDate(card);
    return date < targetDate && date >= oldest;
  });
  return { total: cards.length, cards };
}

export function orderedCadenceJournals(targetDate: string, journals: OncologyJournal[]) {
  const primary = TOP_JOURNAL_RELEASE_CADENCE[weekdayReleaseIndex(targetDate)];
  const names = [primary, ...TOP_JOURNAL_FALLBACK_ORDER.filter((name) => name !== primary)];
  const byName = new Map(journals.map((journal) => [journal.name.toLowerCase(), journal]));
  return names.map((name) => byName.get(name.toLowerCase())).filter((journal): journal is OncologyJournal => Boolean(journal?.enabled));
}
