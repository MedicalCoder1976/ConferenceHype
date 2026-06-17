import { randomUUID } from "node:crypto";
import { getPersona, personas } from "@/lib/generation/personas";
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
  const createdAt = new Date().toISOString();
  const batchPrefix = options.batchLabel ? `${options.batchLabel}: ` : "Batch pick: ";
  const itemPosition =
    typeof options.index === "number" ? ` Card ${options.index + 1}.` : "";

  return {
    id: `batch-intake-${randomUUID()}`,
    title: `${batchPrefix}${topic}`,
    summary: `${item.sourceName} source-backed intake. ${truncateWords(sourceDetail, 34)}`,
    script: [
      itemPosition,
      `${persona.name} is covering a source-backed item from ${item.sourceName}.`,
      `The topic is ${topic}.`,
      spokenDetail,
      "Coverage stays with the cited source record and does not give medical advice."
    ].join(" ").replace(/\s+/g, " ").trim(),
    contentType: contentTypeForItem(item),
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "standard",
    language: "English",
    status: "pending_review",
    citations: [
      {
        label: `${item.sourceName}: ${item.title}`,
        url: item.url,
        sourceType: item.sourceType
      }
    ],
    socialBuzzItems: [],
    riskFlags: [
      "previous_day_batch_intake",
      "operator_selected_batch_card",
      "genuine_source_rewrite"
    ],
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
    return true;
  }

  const text = `${item.title} ${item.excerpt} ${item.sourceName}`.toLowerCase();
  const conferenceMatch = conferences.some((conference) =>
    [conference.name, conference.acronym]
      .filter(Boolean)
      .some((value) => text.includes(String(value).toLowerCase()))
  );
  const journalMatch = journals.some(
    (journal) =>
      text.includes(journal.name.toLowerCase()) ||
      text.includes(journal.abbreviation.toLowerCase()) ||
      item.sourceId === journal.id ||
      item.sourceId === `daily-journal-${journal.id}`
  );
  const sourceMatch = Boolean(item.sourceId && sourceIds.includes(item.sourceId));
  return conferenceMatch || journalMatch || sourceMatch;
}
