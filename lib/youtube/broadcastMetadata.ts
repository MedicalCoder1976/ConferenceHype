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
  // Optional. When set, the title's date label reflects this (a card
  // citation's publishedAt) instead of the broadcast's own air date --
  // used by the 30-minute single-journal show, whose title should show the
  // journal issue's month/date, not when it aired. Existing callers omit
  // this and get today's unchanged air-date behavior.
  titleDateOverride?: string;
  studySourceTextBySegmentId?: Map<string, string>;
};

export type BroadcastMetadataTier = "dominant" | "roundup" | "generic";

export type BroadcastMetadata = {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  // The same tier the title/description used, plus the exact values that
  // drove it -- exposed so a consumer (the thumbnail route) can reuse the
  // identical resolved data instead of re-deriving it (e.g. by parsing the
  // title string), which would risk disagreeing with the title/description.
  tier: BroadcastMetadataTier;
  journalName?: string;
  specialty?: string;
  dateLabel: string;
  studyNames: string[];
  thumbnailHeadline?: string;
};

const TITLE_MAX_LENGTH = 100;
const MAX_TAGS_TOTAL_CHARS = 500;
const MAX_TAG_LENGTH = 30;
const OPTIMIZATION_START_DATE = "2026-07-24";

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

function easternDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York"
  }).format(date);
}

const GENERIC_STUDY_WORDS = new Set([
  "this", "the", "our", "clinical", "controlled", "randomized", "prospective",
  "retrospective", "cohort", "pilot", "current", "previous", "present", "target"
]);

function looksLikeExplicitStudyToken(value: string) {
  const token = value.trim();
  if (GENERIC_STUDY_WORDS.has(token.toLowerCase())) return false;
  return /^[A-Z0-9-]{3,}$/.test(token) || /[a-z][A-Z]|[A-Z].*[A-Z]/.test(token) || /\d/.test(token);
}

export function extractExplicitStudyNames(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  const found: string[] = [];
  const add = (candidate: string | undefined) => {
    const normalized = candidate?.replace(/\s+/g, " ").trim();
    if (normalized && !found.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) found.push(normalized);
  };
  for (const match of clean.matchAll(/\b(?:NCT|ISRCTN|ACTRN)\s*[-:]?\s*[A-Z0-9-]{5,}\b/gi)) add(match[0].replace(/\s+/g, ""));
  for (const match of clean.matchAll(/\b([A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,4}\s+(?:study|trial)\s+\d+[A-Za-z-]*)\b/gi)) add(match[1]);
  for (const match of clean.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,39})\s+(?:(?:randomized|randomised|placebo-controlled|controlled|phase\s+[1-4])\s+){0,3}(study|trial)\b/gi)) {
    if (looksLikeExplicitStudyToken(match[1])) add(`${match[1]} ${match[2]}`);
  }
  return found;
}

export function extractExplicitStudyName(value: string) {
  return extractExplicitStudyNames(value)[0];
}

// Historical database rows may still contain the old catch-all "Others"
// value. Never expose that non-specific label in viewer-facing metadata.
function specificSpecialty(journal: OncologyJournal) {
  if (journal.specialty && journal.specialty !== "Others") return journal.specialty;
  const name = journal.name.toLowerCase();
  if (/(neurolog|neurosurg)/.test(name)) return "Neurology";
  if (/psychiatr/.test(name)) return "Psychiatry";
  if (/ophthalm/.test(name)) return "Ophthalmology";
  if (/(thorax|pulmon|respir)/.test(name)) return "Pulmonology";
  if (/endocrin/.test(name)) return "Endocrinology";
  return "Medical Journal";
}

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
    const specialty = specificSpecialty(card.journal);
    specialtyCounts.set(specialty, (specialtyCounts.get(specialty) ?? 0) + 1);
  }
  const dominantJournalEntry = [...journalCounts.values()].sort((a, b) => b.count - a.count)[0];
  const dominantSpecialtyEntry = [...specialtyCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    dominantJournal: dominantJournalEntry,
    dominantSpecialty: dominantSpecialtyEntry?.[0],
    anyJournalResolved: journalCounts.size > 0
  };
}

// Single source of truth for which of the three tiers a given hour falls
// into -- both the title and the thumbnail (and the returned
// BroadcastMetadata.tier field) must use this exact same resolution, never
// a second independent derivation, so they can never disagree.
function resolveTier({
  dominantJournal,
  dominantSpecialty,
  anyJournalResolved
}: {
  dominantJournal?: { journal: OncologyJournal; count: number };
  dominantSpecialty?: string;
  anyJournalResolved: boolean;
}): { tier: BroadcastMetadataTier; journalName?: string; specialty?: string } {
  if (dominantJournal && dominantJournal.count >= 2) {
    return {
      tier: "dominant",
      journalName: dominantJournal.journal.name,
      specialty: specificSpecialty(dominantJournal.journal)
    };
  }
  if (anyJournalResolved) {
    return { tier: "roundup", specialty: dominantSpecialty };
  }
  return { tier: "generic" };
}

function buildTitle({
  resolved,
  conferenceName,
  label,
  studyName,
  optimized
}: {
  resolved: { tier: BroadcastMetadataTier; journalName?: string; specialty?: string };
  conferenceName?: string;
  label: string;
  studyName?: string;
  optimized: boolean;
}) {
  let title: string;
  if (optimized && studyName) {
    const context = resolved.journalName ?? resolved.specialty ?? conferenceName ?? "Medical Research";
    title = `${studyName}: ${context} - ${label}`;
  } else if (resolved.tier === "dominant") {
    const specialtyPart = resolved.specialty ? ` - ${resolved.specialty}` : "";
    title = `ConferenceHype: ${resolved.journalName}${specialtyPart} - ${label}`;
  } else if (resolved.tier === "roundup") {
    title = `ConferenceHype: ${resolved.specialty ?? "Medical Journal"} Roundup - ${label}`;
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
  tags,
  studyNames,
  optimized
}: {
  cards: ResolvedCard[];
  hourStart: Date;
  dominantJournal?: { journal: OncologyJournal; count: number };
  dominantSpecialty?: string;
  anyJournalResolved: boolean;
  tags: string[];
  studyNames: string[];
  optimized: boolean;
}) {
  let intro: string;
  const journalEditions = new Map<string, Set<string>>();
  for (const { journal, publishedAt } of cards) {
    if (!journal) continue;
    const editions = journalEditions.get(journal.name) ?? new Set<string>();
    editions.add(monthYearLabel(publishedAt) ?? "publication date unavailable");
    journalEditions.set(journal.name, editions);
  }
  const journalEditionLine = journalEditions.size > 0
    ? `Journals and publication dates covered: ${[...journalEditions.entries()]
        .map(([journal, editions]) => `${journal} (${[...editions].join(", ")})`)
        .join("; ")}.`
    : "";
  if (dominantJournal && dominantJournal.count >= 2) {
    const specialty = specificSpecialty(dominantJournal.journal);
    intro = `This ConferenceHype journal broadcast focuses on ${dominantJournal.journal.name} coverage in ${specialty}, source-attributed for physicians, NPs, and PAs following the literature.`;
  } else if (anyJournalResolved) {
    intro = `This hour of ConferenceHype covers ${dominantSpecialty ?? "medical journal"} literature across multiple journals, source-attributed for physicians, NPs, and PAs.`;
  } else {
    intro = "Source-attributed ConferenceHype medical-conference programming.";
  }

  const chapterLines = cards.map(({ slot, journal, publishedAt }) => {
    const elapsedSeconds = (slot.at.getTime() - hourStart.getTime()) / 1000;
    const timestamp = formatElapsed(elapsedSeconds);
    if (journal) {
      const specialty = specificSpecialty(journal);
      const monthYear = monthYearLabel(publishedAt);
      const label = monthYear ? `${journal.name} - ${specialty} - ${monthYear}` : `${journal.name} - ${specialty}`;
      return `${timestamp} ${truncate(label, TITLE_MAX_LENGTH)}`;
    }
    const fallbackLabel = slot.segment?.title ?? slot.label;
    return `${timestamp} ${truncate(fallbackLabel, TITLE_MAX_LENGTH)}`;
  });

  const hashtags = tags.slice(0, 6).map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");

  const studyLine = optimized && studyNames.length ? `Studies covered: ${studyNames.join("; ")}.` : "";
  return [studyLine, intro, journalEditionLine, "", ...chapterLines, "", hashtags].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
}

function buildTags(cards: ResolvedCard[], studyNames: string[] = []) {
  const names = new Set<string>();
  for (const card of cards) {
    if (!card.journal) continue;
    names.add(card.journal.name);
    names.add(specificSpecialty(card.journal));
  }
  const candidates = [...studyNames, ...names, ...GENERIC_TAGS];
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
  const resolved = resolveTier({ dominantJournal, dominantSpecialty, anyJournalResolved });
  const label = input.titleDateOverride
    ? (monthYearLabel(input.titleDateOverride) ?? dateLabel(input.hourStart))
    : dateLabel(input.hourStart);

  const optimized = easternDateKey(input.hourStart) >= OPTIMIZATION_START_DATE;
  const studyNames = optimized
    ? [...new Set(cards.flatMap((card) => {
        const segment = card.slot.segment;
        if (!segment) return [];
        return extractExplicitStudyNames([
          segment.title,
          segment.summary,
          segment.script,
          ...segment.citations.map((citation) => citation.label),
          input.studySourceTextBySegmentId?.get(segment.id) ?? ""
        ].join(" "));
      }))].slice(0, 5)
    : [];
  const title = buildTitle({ resolved, conferenceName: input.conferenceName, label, studyName: studyNames[0], optimized });
  const tags = buildTags(cards, studyNames);
  const description = buildDescription({
    cards,
    hourStart: input.hourStart,
    dominantJournal,
    dominantSpecialty,
    anyJournalResolved,
    tags,
    studyNames,
    optimized
  });

  return {
    title,
    description,
    tags,
    // Env-var override precedence is applied by the caller
    // (scripts/create-youtube-broadcast.ts), not here -- this module stays
    // pure/deterministic for testability.
    categoryId: "27",
    tier: resolved.tier,
    journalName: resolved.journalName,
    specialty: resolved.specialty,
    dateLabel: label,
    studyNames,
    thumbnailHeadline: optimized ? (studyNames[0] ? `${studyNames[0]}: What Did It Find?` : "What Did This Research Find?") : undefined
  };
}
