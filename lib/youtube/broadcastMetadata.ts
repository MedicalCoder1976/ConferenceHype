import type { BroadcastSlot } from "@/lib/rundown/slots";
import { buildClinicalEvidencePackaging } from "@/lib/youtube/clinicalEvidencePackaging";
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
  thumbnailJournalNames?: string[];
  thumbnailJournalCount?: number;
  clinicalTopic?: string;
  thumbnailHook?: string;
  thumbnailEntity?: string;
  thumbnailArticleTitle?: string;
  relevantSpecialties?: string[];
  journalClubSeriesLabel?: string;
};

const TITLE_MAX_LENGTH = 100;
const MAX_TAGS_TOTAL_CHARS = 500;
const MAX_TAG_LENGTH = 30;
const OPTIMIZATION_START_DATE = "2026-07-24";

const GENERIC_TAGS = [
  "Physicians",
  "Advanced Practice Providers",
  "APPs",
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
  for (const match of clean.matchAll(/\b([A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,4}\s+(?:study|trial)\s+\d+[A-Za-z-]*)\b/gi)) add(match[1]);
  for (const match of clean.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,39})\s+(?:(?:randomized|randomised|placebo-controlled|controlled|phase\s+[1-4])\s+){0,3}(study|trial)\b/gi)) {
    if (looksLikeExplicitStudyToken(match[1])) add(`${match[1]} ${match[2]}`);
  }
  for (const match of clean.matchAll(/\b(?:NCT\s*[-:]?\s*\d{6,}|ISRCTN\s*[-:]?\s*\d{6,}|ACTRN\s*[-:]?\s*\d{8,})\b/gi)) add(match[0].replace(/\s+/g, ""));
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

function specialistAudience(specialty: string) {
  const exact: Record<string, string[]> = {
    Gastroenterology: ["Gastroenterologists"],
    Oncology: ["Oncologists"],
    Hematology: ["Hematologists"],
    Cardiology: ["Cardiologists"],
    Psychiatry: ["Psychiatrists"],
    Neurology: ["Neurologists"],
    Nephrology: ["Nephrologists"],
    Pulmonology: ["Pulmonologists"],
    Surgery: ["Surgeons"],
    Ophthalmology: ["Ophthalmologists"],
    "Internal Medicine": ["Internists"],
    "Radiology / Radiation Oncology": ["Radiologists", "Radiation Oncologists"],
    "Pediatric Oncology / Pediatrics": ["Pediatricians", "Pediatric Oncologists"]
  };
  return exact[specialty] ?? [`${specialty} Specialists`];
}

function topicSpecialties(clinicalTopic: string | undefined) {
  const topic = clinicalTopic ?? "";
  const specialties: string[] = [];
  if (/cancer|leukemia|lymphoma|myeloma|myelodysplastic|myelofibrosis|melanoma|sarcoma/i.test(topic)) specialties.push("Oncology");
  if (/leukemia|lymphoma|myeloma|myelodysplastic|myelofibrosis/i.test(topic)) specialties.push("Hematology");
  if (/heart|coronary|atrial fibrillation|cardiovascular/i.test(topic)) specialties.push("Cardiology");
  if (/bowel|Crohn|colitis|liver|hepat/i.test(topic)) specialties.push("Gastroenterology");
  if (/depression|schizophrenia|psychiatr/i.test(topic)) specialties.push("Psychiatry");
  return specialties;
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

function buildDescription({
  cards,
  hourStart,
  dominantJournal,
  dominantSpecialty,
  anyJournalResolved,
  tags,
  studyNames,
  optimized,
  additionalSpecialties = []
}: {
  cards: ResolvedCard[];
  hourStart: Date;
  dominantJournal?: { journal: OncologyJournal; count: number };
  dominantSpecialty?: string;
  anyJournalResolved: boolean;
  tags: string[];
  studyNames: string[];
  optimized: boolean;
  additionalSpecialties?: string[];
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
    intro = `This ConferenceHype journal broadcast focuses on ${dominantJournal.journal.name} coverage in ${specialty} for physicians, NPs, and PAs following the literature.`;
  } else if (anyJournalResolved) {
    intro = `This hour of ConferenceHype covers ${dominantSpecialty ?? "medical journal"} literature across multiple journals for physicians, NPs, and PAs.`;
  } else {
    intro = "ConferenceHype medical-conference programming.";
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

  const journalLine = dominantJournal?.journal.name
    ? `Journal: ${dominantJournal.journal.name}.`
    : journalEditions.size > 0
      ? `Journals: ${[...journalEditions.keys()].join("; ")}.`
      : "";
  const specialties = [...new Set([
    ...cards.map(({ journal }) => journal ? specificSpecialty(journal) : "").filter(Boolean),
    ...additionalSpecialties
  ])];
  const journalClubSpecialty = dominantJournal && dominantJournal.count >= 2
    ? specificSpecialty(dominantJournal.journal)
    : dominantSpecialty;
  const journalClubLine = journalClubSpecialty ? `${journalClubSpecialty} Journal Club` : "";
  const specialtyLine = specialties.length ? `Relevant specialties: ${specialties.join("; ")}.` : "";
  const specialistLabels = [...new Set(specialties.flatMap(specialistAudience))];
  const audienceLine = specialistLabels.length
    ? `Audience: Physicians; Medical Students; ${specialistLabels.join("; ")}; Advanced Practice Providers (APPs).`
    : "Audience: Physicians; Medical Students; Advanced Practice Providers (APPs).";
  const studyLine = optimized && studyNames.length ? `Named studies covered: ${studyNames.join("; ")}.` : "";
  return [journalClubLine, journalLine, specialtyLine, audienceLine, studyLine, intro, journalEditionLine, "", ...chapterLines, "", hashtags].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
}

function buildTags(cards: ResolvedCard[], studyNames: string[] = [], additionalSpecialties: string[] = []) {
  const names = new Set<string>();
  for (const card of cards) {
    if (!card.journal) continue;
    names.add(card.journal.name);
    const specialty = specificSpecialty(card.journal);
    names.add(specialty);
    specialistAudience(specialty).forEach((audience) => names.add(audience));
  }
  for (const specialty of additionalSpecialties) {
    names.add(specialty);
    specialistAudience(specialty).forEach((audience) => names.add(audience));
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

export function assertSearchOptimizedBroadcastMetadata(
  metadata: BroadcastMetadata,
  { requireJournalContext = false }: { requireJournalContext?: boolean } = {}
) {
  if (!metadata.thumbnailHeadline) throw new Error("A search-optimized thumbnail headline is required.");
  if (!metadata.clinicalTopic) throw new Error("A disease or specific clinical topic is required.");
  if (metadata.journalName ? !metadata.title.startsWith(metadata.journalName + ":") : !metadata.title.startsWith(metadata.clinicalTopic + ":")) {
    throw new Error("Journal programs must begin with the journal; other programs must begin with the clinical topic.");
  }
  if (/\bMultiple Cancers\b/i.test(`${metadata.title}\n${metadata.description}\n${metadata.tags.join(" ")}`)) {
    throw new Error("Metadata must never use the generic Multiple Cancers label.");
  }
  if (/\b(?:NCT|ISRCTN|ACTRN)\s*[-:]?\s*\d{6,}\b/i.test(`${metadata.title}\n${metadata.description}\n${metadata.tags.join(" ")}`)) {
    throw new Error("Registry identifiers must not be used as viewer-facing search metadata.");
  }
  if (/\bOthers\b/.test(`${metadata.title}\n${metadata.description}\n${metadata.tags.join(" ")}`)) {
    throw new Error("Search metadata must use a specific specialty, never Others.");
  }
  if (metadata.studyNames.length > 0) {
    const studiesLine = `Named studies covered: ${metadata.studyNames.join("; ")}.`;
    if (!metadata.description.includes(studiesLine)) throw new Error("Every named study must appear in the description.");
    metadata.studyNames.forEach((name, index) => {
      if (metadata.tags[index] !== truncate(name, MAX_TAG_LENGTH)) throw new Error("Explicit study names must lead the YouTube tags.");
    });
    const primaryStudyName = metadata.studyNames[0];
    const thumbnailEntity = metadata.thumbnailEntity;
    const thumbnailIdentifiesPrimaryStudy = thumbnailEntity === primaryStudyName || (
      Boolean(thumbnailEntity?.endsWith("...")) &&
      primaryStudyName.startsWith(thumbnailEntity!.slice(0, -3).trimEnd())
    );
    if (!thumbnailIdentifiesPrimaryStudy) throw new Error("The thumbnail must identify the primary explicit study name.");
  }
  if (requireJournalContext) {
    if (metadata.tier !== "dominant" || !metadata.journalName) throw new Error("A station journal program must resolve one dominant journal.");
    if (!metadata.specialty || metadata.specialty === "Medical Journal") throw new Error("A station journal program must resolve a specific specialty.");
    if (!metadata.description.includes(metadata.journalName)) throw new Error("The description must name the journal.");
    if (!metadata.description.startsWith(`${metadata.specialty} Journal Club\nJournal: ${metadata.journalName}.`)) {
      throw new Error("The description must begin with the specialty Journal Club label before the journal name.");
    }
    if (!metadata.title.startsWith(`${metadata.journalName}:`)) throw new Error("The journal must begin the title.");
    const specialtyLine = metadata.description.split("\n").find((line) => line.startsWith("Relevant specialties:"));
    if (!specialtyLine?.includes(metadata.specialty)) throw new Error("The description must identify the relevant specialty.");
    const audienceLine = metadata.description.split("\n").find((line) => line.startsWith("Audience:"));
    if (!audienceLine?.includes("Physicians") || !audienceLine.includes("Advanced Practice Providers (APPs)")) {
      throw new Error("The description must identify physicians and APPs as general audiences.");
    }
    if (metadata.thumbnailJournalNames?.[0] !== metadata.journalName) throw new Error("The thumbnail must identify the journal.");
    if (!metadata.description.includes("Journals and publication dates covered:") || metadata.description.includes("publication date unavailable")) {
      throw new Error("The description must include the journal's source publication month and year.");
    }
  }
  return metadata;
}
export function buildBroadcastMetadata(input: BroadcastMetadataInput): BroadcastMetadata {
  const cards = resolveContentCards(input.slots, input.journalsById);
  const { dominantJournal, dominantSpecialty, anyJournalResolved } = tallyDominant(cards);
  const resolved = resolveTier({ dominantJournal, dominantSpecialty, anyJournalResolved });
  const label = input.titleDateOverride
    ? (monthYearLabel(input.titleDateOverride) ?? dateLabel(input.hourStart))
    : dateLabel(input.hourStart);

  const optimized = easternDateKey(input.hourStart) >= OPTIMIZATION_START_DATE;
  const discoveredStudyNames = cards.flatMap((card) => {
    const segment = card.slot.segment;
    if (!segment) return [];
    return extractExplicitStudyNames([
      segment.title,
      segment.summary,
      segment.script,
      ...segment.citations.map((citation) => citation.label),
      input.studySourceTextBySegmentId?.get(segment.id) ?? ""
    ].join(" "));
  });
  const studyNames = optimized
    ? [...new Set(discoveredStudyNames)].sort((left, right) =>
        Number(/^(?:NCT|ISRCTN|ACTRN)/i.test(left)) - Number(/^(?:NCT|ISRCTN|ACTRN)/i.test(right))
      ).filter((name) => !/^(?:NCT|ISRCTN|ACTRN)/i.test(name)).slice(0, 5)
    : [];
  const thumbnailJournalNames = [...cards.reduce((counts, card) => {
    if (card.journal) counts.set(card.journal.name, (counts.get(card.journal.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name]) => name);
  const primarySegment = cards.find((card) => studyNames[0] && [card.slot.segment?.title, card.slot.segment?.summary, card.slot.segment?.script].join(" ").includes(studyNames[0]))?.slot.segment ?? cards[0]?.slot.segment;
  const sourceText = cards.map((card) => [card.slot.segment?.title, card.slot.segment?.summary, card.slot.segment?.script].filter(Boolean).join("\n")).join("\n");
  const packaging = buildClinicalEvidencePackaging({
    title: primarySegment?.title,
    specialty: resolved.specialty,
    explicitTopic: resolved.specialty,
    sourceText,
    studyNames,
    multiTopic: new Set(cards.map((card) => card.journal ? specificSpecialty(card.journal) : "").filter(Boolean)).size > 1
  });
  const journalPrefix = resolved.journalName ? `${resolved.journalName}: ` : "";
  const readableTopic = packaging.clinicalTopic === resolved.specialty ? `${resolved.specialty} Update` : packaging.clinicalTopic;
  const namedStudyPrefix = packaging.primaryEntity ? `${packaging.primaryEntity}: ` : "";
  const titleBody = resolved.journalName
    ? `${readableTopic} - New ${resolved.specialty} Research`
    : `${readableTopic} - ${namedStudyPrefix}${packaging.outcomeHook}`;
  const title = `${journalPrefix}${truncate(titleBody, TITLE_MAX_LENGTH - journalPrefix.length)}`;
  const additionalSpecialties = topicSpecialties(packaging.clinicalTopic).filter((specialty) => specialty !== resolved.specialty);
  const tags = buildTags(cards, studyNames, additionalSpecialties);
  const description = buildDescription({
    cards,
    hourStart: input.hourStart,
    dominantJournal,
    dominantSpecialty,
    anyJournalResolved,
    tags,
    studyNames,
    optimized,
    additionalSpecialties
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
    clinicalTopic: packaging.clinicalTopic,
    thumbnailHeadline: packaging.thumbnailHook,
    thumbnailHook: packaging.thumbnailHook,
    thumbnailEntity: packaging.thumbnailEntity,
    thumbnailArticleTitle: primarySegment?.title?.trim(),
    thumbnailJournalNames: thumbnailJournalNames.slice(0, 2),
    thumbnailJournalCount: thumbnailJournalNames.length
  };
}
