import { randomUUID } from "node:crypto";
import { getPersona, personas } from "@/lib/generation/personas";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import { fetchPubMedAbstract } from "@/lib/sources/pubmed";
import {
  buildRequiredSectionSummary,
  hasExplicitClinicalStructure,
  hasGenericSectionFallback,
  hasUsableClinicalSectionSource
} from "@/lib/segments/sectionSummary";
import type {
  ContentType,
  IngestedItem,
  MedicalConference,
  OncologyJournal,
  Segment
} from "@/lib/types";

export function contentTypeForItem(item: IngestedItem): ContentType {
  if (item.sourceType === "official") {
    return "agenda_preview";
  }
  if (item.sourceType === "company") {
    return "industry_floor";
  }
  if (item.sourceType.includes("social")) {
    return "social_signal";
  }
  return "media_roundup";
}

export function cleanIntakeText(value: string, fallback: string) {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    .replace(/\bwww\.\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function sentenceFragments(value: string) {
  return cleanIntakeText(value, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20)
    .slice(0, 3);
}

function truncateWords(value: string, maxWords: number) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}.` : value;
}

export function isJournalItem(item: IngestedItem) {
  return (
    item.sourceId?.startsWith("daily-journal-") ||
    /\b(journal|jama|lancet|nejm|nature|annals|leukemia|bmj|blood cancer)\b/i.test(
      item.sourceName
    )
  );
}

// Journal-sourced items carry their catalog journal id as item.sourceId,
// either bare (real RSS/PubMed-ingested items -- lib/jobs/ingest.ts's
// additionalSources gives journal-derived sources `id: journal.id`,
// unprefixed) or prefixed "daily-journal-" (weekly-sweep context items --
// see weeklySourceCardGeneration.ts). Returns whichever raw id is present
// as a *candidate* -- this has no DB access, so it cannot validate against
// a real journal list. The consumer (lib/youtube/broadcastMetadata.ts)
// resolves the candidate against a real journalsById map and treats any
// miss (including a stray non-journal id) as "no journal data," so a
// false-positive candidate here is harmless.
export function journalIdFromSourceId(sourceId: string | undefined): string | undefined {
  if (!sourceId) return undefined;
  return sourceId.match(/^daily-journal-(.+)$/)?.[1] ?? sourceId;
}

export function isClinicalScienceItem(item: IngestedItem) {
  const text = `${item.title} ${item.excerpt} ${item.sourceName}`;
  return (
    isJournalItem(item) ||
    /\b(abstract|clinical\s+trial|trial|randomized|phase\s?(?:i|ii|iii|iv|1|2|3|4)|cohort|study|results?|endpoint|survival|response|pfs|os|mrd|biomarker|lymphoma|leukemia|myeloma|cancer|oncology)\b/i.test(text)
  );
}

export function isNonSubstantiveConferenceInformationItem(item: IngestedItem) {
  const text = `${item.title} ${item.excerpt} ${item.sourceName}`;
  return (
    item.sourceType === "official" &&
    /\b(program|congress|conference|meeting|topics-in-focus|guidelines|learning\s+paths|curriculum|working\s+groups|cme\s+credits|registration|platform|onboarding|thank\s+you\s+for\s+joining)\b/i.test(text) &&
    !/\b(abstract|objective|patients?|randomi[sz]ed|trial|cohort|endpoint|survival|response|hazard\s+ratio|confidence\s+interval|p\s*[<=>]|median|primary\s+endpoint|secondary\s+endpoint|results?\s+(?:showed|demonstrated|reported|included))\b/i.test(text) &&
    (
      /\b(clinical\s+practice\s+our\s+guidelines|learning\s+paths\s+european\s+hematology\s+curriculum|monitoring\s+and\s+career\s+development|specialized\s+working\s+groups|ebah\s+cme\s+credits|topics-in-focus\s+program)\b/i.test(text) ||
      text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim().length > 35).length < 3
    )
  );
}

function pubMedSummaryIsUsable({
  title,
  sourceName,
  abstract
}: {
  title: string;
  sourceName: string;
  abstract: string;
}) {
  const summary = buildRequiredSectionSummary({
    title,
    sourceName,
    text: abstract
  });
  return hasUsableClinicalSectionSource(abstract) && !hasGenericSectionFallback(summary);
}

export async function buildPubMedBackedJournalItem(item: IngestedItem) {
  // Social posts are short attributed callouts, not journal articles — skip
  // PubMed enrichment and the structured-science requirements entirely.
  if (item.sourceType === "general_social") {
    return item;
  }
  const scienceItem = isClinicalScienceItem(item);
  if (isNonSubstantiveConferenceInformationItem(item)) {
    return null;
  }
  if (!scienceItem) {
    return item;
  }

  const pubmed = await fetchPubMedAbstract({
    title: item.title,
    url: item.url
  });

  if (pubmed?.abstract && pubMedSummaryIsUsable({
    title: pubmed.title || item.title,
    sourceName: item.sourceName,
    abstract: pubmed.abstract
  })) {
    return {
      ...item,
      title: pubmed.title || item.title,
      url: pubmed.url || item.url,
      excerpt: pubmed.abstract
    };
  }

  if (!isJournalItem(item) && hasUsableClinicalSectionSource(item.excerpt)) {
    return item;
  }

  return null;
}

function formatConferenceDateRange(conference: MedicalConference) {
  if (conference.startDate && conference.endDate) {
    return conference.startDate === conference.endDate
      ? conference.startDate
      : `${conference.startDate} through ${conference.endDate}`;
  }
  if (conference.startDate) {
    return conference.startDate;
  }
  if (conference.month && conference.year) {
    return `${conference.year}-${String(conference.month).padStart(2, "0")}`;
  }
  return "";
}

export function buildConferenceContextItem(conference: MedicalConference): IngestedItem {
  const acronym = conference.acronym ? `${conference.acronym} ` : "";
  const dateRange = formatConferenceDateRange(conference);
  const location = [conference.city, conference.country].filter(Boolean).join(", ");
  const specialties = conference.specialties.length
    ? conference.specialties.join(", ")
    : "medical";
  const details = [
    `Official meeting context: ${conference.name} is listed as a ${specialties} meeting.`,
    dateRange ? `Dates: ${dateRange}.` : "",
    location ? `Location: ${location}.` : "",
    `Source: the official meeting page for ${conference.name}.`
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `conference-context-${conference.id}`,
    sourceId: `daily-conference-${conference.id}-context`,
    title: `${acronym}${conference.year ?? ""} official conference context`
      .replace(/\s+/g, " ")
      .trim(),
    url: conference.officialUrl,
    excerpt: details,
    sourceName: conference.name,
    sourceType: "official",
    rank: 1
  };
}
function monthEdition(item: IngestedItem) {
  const source = item.publishedAt ? new Date(item.publishedAt) : undefined;
  if (source && !Number.isNaN(source.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(source);
  }
  const text = `${item.title} ${item.excerpt}`;
  return (
    text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0] ??
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date())
  );
}

function topicFromItem(item: IngestedItem) {
  const title = cleanIntakeText(item.title, "source-attributed update");
  return title.replace(/[.:;!?]+$/g, "");
}

export function buildBatchSegment(
  item: IngestedItem,
  personaId: string,
  options: {
    startsAt?: string;
    index?: number;
    batchLabel?: string;
  } = {}
): Segment {
  const persona = getPersona(personaId);
  const topic = topicFromItem(item);
  const details = sentenceFragments(item.excerpt);
  const fallbackDetail =
    "The batch item did not include enough summary detail, so the card should be reviewed against the linked source before placement.";
  const sourceDetail = details.length ? details.join(" ") : fallbackDetail;
  const spokenDetail = truncateWords(sourceDetail, 64);
  const itemPosition =
    typeof options.index === "number" ? ` Card ${options.index + 1}.` : "";
  const journalItem = isJournalItem(item);
  const socialItem = item.sourceType === "general_social";
  const edition = monthEdition(item);
  // Narrative reviews, editorials, and commentaries have no real Methods or
  // Results to extract. Forcing the Background/Methods/Results/Discussion
  // template onto those fabricates a "Results"/"Discussion" label over an
  // arbitrary sentence split. When there is no genuine clinical-trial
  // structure in the abstract, just call it a good review on the topic and
  // point listeners to the source instead.
  const narrativeReview = journalItem && !hasExplicitClinicalStructure(item.excerpt);
  // Social posts are short attributed callouts, not journal articles — the
  // Background/Methods/Results/Discussion template forces a "needs PubMed
  // confirmation" filler into Methods/Results whenever the post is shorter
  // than 4 sentences (the common case), which trips the missing-intake
  // failure-language guard. Use the plain extracted detail instead.
  const sectionSummary = socialItem || narrativeReview
    ? ""
    : buildRequiredSectionSummary({
        title: topic,
        sourceName: item.sourceName,
        text: item.excerpt
      });
  const summary = journalItem
    ? narrativeReview
      ? `From the ${edition} edition of ${item.sourceName}. ${spokenDetail}`
      : `From the ${edition} edition of ${item.sourceName}. ${truncateWords(sectionSummary, 42)}`
    : socialItem
      ? `${item.sourceName} callout. ${spokenDetail}`
      : `${item.sourceName} coverage. ${truncateWords(sectionSummary, 42)}`;
  const script = journalItem
    ? narrativeReview
      ? [
          `From the ${edition} edition of ${item.sourceName}, this is a review covering ${topic}.`,
          spokenDetail,
          `This is a good review on the topic, well worth reading in full in this issue of ${item.sourceName}.`
        ]
      : [
          `From the ${edition} edition of ${item.sourceName}, this journal review looks at ${topic}.`,
          sectionSummary
        ]
    : socialItem
      ? [itemPosition, `${persona.name} calls out a post from ${item.sourceName}.`, spokenDetail]
      : [
          itemPosition,
          `${persona.name} is covering ${item.sourceName}.`,
          `The topic is ${topic}.`,
          // Bug fixed 2026-07-06: this used to hard-truncate the whole
          // Background/Methods/Results/Discussion narrative at a blind
          // 82-word cutoff, with no regard for sentence boundaries -- cards
          // from any source isJournalItem() doesn't recognize (e.g. "JCO
          // Precision Oncology", which has no "journal"/"jama"/"lancet"/etc.
          // keyword in its name) went through this branch instead of the
          // journalItem branch above, which already uses sectionSummary in
          // full. Real aired cards showed the truncation landing mid-
          // sentence in Discussion ("The proceedings revealed that.", full
          // stop, nothing more). sectionSummary's own buildRequiredSectionSummary
          // already keeps each section to one sentence via firstSentence(),
          // so it doesn't need a second, cruder word-count cap here -- and
          // formatVoiceSegment's word-budget trimming at render time already
          // handles the rare case where the real narrative is genuinely too
          // long, in a section-aware way (see compactFourSectionNarrative).
          sectionSummary || truncateWords(spokenDetail, 82)
        ];
  const createdAt = new Date().toISOString();
  const batchPrefix = options.batchLabel ? `${options.batchLabel}: ` : "Batch pick: ";

  return {
    id: `batch-intake-${randomUUID()}`,
    title: `${batchPrefix}${topic}`,
    summary,
    script: script.join(" ").replace(/\s+/g, " ").trim(),
    contentType: journalItem ? "abstract_buzz" : contentTypeForItem(item),
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "standard",
    language: "English",
    status: "pending_review",
    citations: [
      {
        label: `${item.sourceName}: ${item.title}`,
        url: item.url,
        sourceType: item.sourceType,
        journalId: journalItem ? journalIdFromSourceId(item.sourceId) : undefined,
        publishedAt: item.publishedAt
      }
    ],
    socialBuzzItems: [],
    riskFlags: [
      "previous_day_batch_intake",
      "operator_selected_batch_card",
      "genuine_source_rewrite"
    ]
      .concat(item.sourceId ? [`source_id:${item.sourceId}`] : [])
      .concat(narrativeReview ? ["narrative_review_card"] : []),
    confidenceScore: item.excerpt ? 84 : 65,
    createdAt,
    updatedAt: createdAt
  };
}

export function personaIdForBatchIndex(index: number) {
  return personas[index % personas.length]?.id ?? "echo-sage";
}

export function itemMatchesSelections({
  item,
  conferences,
  journals,
  sourceIds
}: {
  item: IngestedItem;
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sourceIds: string[];
}) {
  const hasSelection = conferences.length > 0 || journals.length > 0 || sourceIds.length > 0;
  if (!hasSelection) {
    return false;
  }
  if (isGenericConferenceLandingItem(item)) {
    return false;
  }

  const conferenceMatch = conferences.some(
    (conference) =>
      item.sourceId === conference.id ||
      item.sourceId === `daily-conference-${conference.id}` ||
      item.sourceId?.startsWith(`daily-conference-${conference.id}-`)
  );
  const journalMatch = journals.some(
    (journal) =>
      item.sourceId === journal.id ||
      item.sourceId === `daily-journal-${journal.id}` ||
      item.sourceId?.startsWith(`daily-journal-${journal.id}-`)
  );
  const sourceMatch = Boolean(
    item.sourceId &&
      (sourceIds.includes(item.sourceId) ||
        sourceIds.some((id) => item.sourceId!.startsWith(`${id}-`)))
  );
  return conferenceMatch || journalMatch || sourceMatch;
}
