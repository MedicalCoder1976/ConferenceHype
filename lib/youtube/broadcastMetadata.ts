import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { OncologyJournal } from "@/lib/types";

export type BroadcastMetadataInput = {
  hourStart: Date;
  conferenceName?: string;
  // From buildBroadcastSlots() -- reuse its scheduling math rather than
  // re-deriving card offsets, so chapter timestamps always match what
  // actually airs.
  slots: BroadcastSlot[];
  journalsById: Map<string, OncologyJournal>;
};

export type BroadcastMetadata = {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
};

const TITLE_MAX_LENGTH = 100;
const MAX_TAGS_TOTAL_CHARS = 500;
const MAX_TAG_LENGTH = 30;

const GENERIC_TAGS = [
  "Medical Education",
  "CME",
  "Continuing Medical Education",
  "Clinical Trials",
  "Medical Journal Update",
  "ConferenceHype"
];

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  }).format(date);
}

function monthYearLabel(publishedAt: string | undefined) {
  if (!publishedAt) return undefined;
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}

function formatElapsed(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

type ResolvedCard = {
  slot: BroadcastSlot;
  journal?: OncologyJournal;
  publishedAt?: string;
};

function resolveContentCards(
  slots: BroadcastSlot[],
  journalsById: Map<string, OncologyJournal>
): ResolvedCard[] {
  return slots
    .filter((slot) => Boolean(slot.segment))
    .map((slot) => {
      const citation = slot.segment?.citations?.[0];
      const journal = citation?.journalId ? journalsById.get(citation.journalId) : undefined;
      return { slot, journal, publishedAt: citation?.publishedAt };
    });
}

function tallyDominant(cards: ResolvedCard[]) {
  const journalCounts = new Map<string, { journal: OncologyJournal; count: number }>();
  const specialtyCounts = new Map<string, number>();
  for (const card of cards) {
    if (!card.journal) continue;
    const existing = journalCounts.get(card.journal.id);
    journalCounts.set(card.journal.id, {
      journal: card.journal,
      count: (existing?.count ?? 0) + 1
    });
    if (card.journal.specialty) {
      specialtyCounts.set(card.journal.specialty, (specialtyCounts.get(card.journal.specialty) ?? 0) + 1);
    }
  }
  const dominantJournalEntry = [...journalCounts.values()].sort((a, b) => b.count - a.count)[0];
  const dominantSpecialtyEntry = [...specialtyCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    dominantJournal: dominantJournalEntry,
    dominantSpecialty: dominantSpecialtyEntry?.[0],
    anyJournalResolved: journalCounts.size > 0
  };
}

function buildTitle({
  dominantJournal,
  dominantSpecialty,
  anyJournalResolved,
  conferenceName,
  hourStart
}: {
  dominantJournal?: { journal: OncologyJournal; count: number };
  dominantSpecialty?: string;
  anyJournalResolved: boolean;
  conferenceName?: string;
  hourStart: Date;
}) {
  const label = dateLabel(hourStart);
  let title: string;
  if (dominantJournal && dominantJournal.count >= 2) {
    const specialtyPart = dominantJournal.journal.specialty ? ` - ${dominantJournal.journal.specialty}` : "";
    title = `ConferenceHype: ${dominantJournal.journal.name}${specialtyPart} - ${label}`;
  } else if (anyJournalResolved) {
    title = `ConferenceHype: ${dominantSpecialty ?? "Medical Journal"} Roundup - ${label}`;
  } else {
    title = `ConferenceHype: ${conferenceName ?? "Medical Conference"} live programming - ${label}`;
  }
  return truncate(title, TITLE_MAX_LENGTH);
}

function buildDescription({
  cards,
  hourStart,
  dominantJournal,
  dominantSpecialty,
  anyJournalResolved,
  tags
}: {
  cards: ResolvedCard[];
  hourStart: Date;
  dominantJournal?: { journal: OncologyJournal; count: number };
  dominantSpecialty?: string;
  anyJournalResolved: boolean;
  tags: string[];
}) {
  let intro: string;
  if (dominantJournal && dominantJournal.count >= 2) {
    const specialty = dominantJournal.journal.specialty ?? "medicine";
    intro = `This hour of ConferenceHype focuses on ${dominantJournal.journal.name} coverage in ${specialty}, source-attributed for physicians, NPs, and PAs following the literature.`;
  } else if (anyJournalResolved) {
    intro = `This hour of ConferenceHype covers ${dominantSpecialty ?? "medical journal"} literature across multiple journals, source-attributed for physicians, NPs, and PAs.`;
  } else {
    intro = "Source-attributed ConferenceHype medical-conference programming.";
  }

  const chapterLines = cards.map(({ slot, journal, publishedAt }) => {
    const elapsedSeconds = (slot.at.getTime() - hourStart.getTime()) / 1000;
    const timestamp = formatElapsed(elapsedSeconds);
    if (journal) {
      const specialty = journal.specialty ?? "Medicine";
      const monthYear = monthYearLabel(publishedAt);
      const label = monthYear ? `${journal.name} - ${specialty} - ${monthYear}` : `${journal.name} - ${specialty}`;
      return `${timestamp} ${truncate(label, TITLE_MAX_LENGTH)}`;
    }
    const fallbackLabel = slot.segment?.title ?? slot.label;
    return `${timestamp} ${truncate(fallbackLabel, TITLE_MAX_LENGTH)}`;
  });

  const hashtags = tags.slice(0, 6).map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");

  return [intro, "", ...chapterLines, "", hashtags].join("\n");
}

function buildTags(cards: ResolvedCard[]) {
  const names = new Set<string>();
  for (const card of cards) {
    if (!card.journal) continue;
    names.add(card.journal.name);
    if (card.journal.specialty) names.add(card.journal.specialty);
  }
  const candidates = [...names, ...GENERIC_TAGS];
  const tags: string[] = [];
  let totalChars = 0;
  for (const candidate of candidates) {
    const tag = truncate(candidate, MAX_TAG_LENGTH);
    const cost = tag.length + 3;
    if (totalChars + cost > MAX_TAGS_TOTAL_CHARS) continue;
    tags.push(tag);
    totalChars += cost;
  }
  return tags;
}

export function buildBroadcastMetadata(input: BroadcastMetadataInput): BroadcastMetadata {
  const cards = resolveContentCards(input.slots, input.journalsById);
  const { dominantJournal, dominantSpecialty, anyJournalResolved } = tallyDominant(cards);

  const title = buildTitle({
    dominantJournal,
    dominantSpecialty,
    anyJournalResolved,
    conferenceName: input.conferenceName,
    hourStart: input.hourStart
  });
  const tags = buildTags(cards);
  const description = buildDescription({
    cards,
    hourStart: input.hourStart,
    dominantJournal,
    dominantSpecialty,
    anyJournalResolved,
    tags
  });

  return {
    title,
    description,
    tags,
    // Env-var override precedence is applied by the caller
    // (scripts/create-youtube-broadcast.ts), not here -- this module stays
    // pure/deterministic for testability.
    categoryId: "27"
  };
}
