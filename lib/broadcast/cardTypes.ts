import type { BroadcastWriteoutCard, ContentType, Segment } from "@/lib/types";

export type BroadcastCardType =
  | "Journal coverage"
  | "Abstracts"
  | "Conference Coverage"
  | "Media watch"
  | "Pharma watch"
  | "Diagnostic Company watch";

type CardTypeInput = Partial<
  Pick<
    Segment,
    "title" | "summary" | "script" | "contentType" | "citations" | "riskFlags"
  >
> &
  Partial<Pick<BroadcastWriteoutCard, "sourceLabel" | "sourceUrl">> & {
    contentType?: ContentType;
  };

const JOURNAL_PATTERN =
  /\b(journal|pubmed|lancet|jama|nejm|new england journal|annals of oncology|journal of clinical oncology|jco|blood cancer journal|nature medicine|nature cancer|bmj|leukemia)\b/i;
const ABSTRACT_PATTERN =
  /\b(abstract|poster|oral presentation|plenary|late[- ]breaking|abstract library|clinical trial abstract)\b/i;
const DIAGNOSTIC_PATTERN =
  /\b(diagnostic|diagnostics|assay|sequenc|genomic|molecular test|ctdna|liquid biopsy|pathology|imaging|radiology|companion diagnostic|biomarker test|ngs)\b/i;
const PHARMA_PATTERN =
  /\b(pharma|biotech|drug|therapy|therapeutic|pipeline|fda|ema|regulatory|sponsor|company|inc\.|corp\.|ltd\.|merck|pfizer|novartis|roche|astrazeneca|bristol myers|bms|gilead|amgen|sanofi|lilly|j&j|johnson & johnson|abbvie|takeda|daiichi|genentech)\b/i;

function joined(input: CardTypeInput) {
  return [
    input.title,
    input.summary,
    input.script,
    input.sourceLabel,
    input.sourceUrl,
    ...(input.citations ?? []).flatMap((citation) => [citation.label, citation.url]),
    ...(input.riskFlags ?? [])
  ]
    .filter(Boolean)
    .join(" ");
}

export function cardTypeLabel(input?: CardTypeInput): BroadcastCardType {
  if (!input) {
    return "Media watch";
  }
  const text = joined(input);

  if (DIAGNOSTIC_PATTERN.test(text)) {
    return "Diagnostic Company watch";
  }
  if (JOURNAL_PATTERN.test(text) || input.contentType === "abstract_buzz") {
    return ABSTRACT_PATTERN.test(text) ? "Abstracts" : "Journal coverage";
  }
  if (input.contentType === "agenda_preview" || /\b(conference|meeting|congress|program|schedule|session|agenda)\b/i.test(text)) {
    return "Conference Coverage";
  }
  if (input.contentType === "industry_floor" || PHARMA_PATTERN.test(text)) {
    return "Pharma watch";
  }
  if (input.contentType === "social_signal" || input.contentType === "media_roundup") {
    return "Media watch";
  }
  return "Media watch";
}

export function cardTypeEyebrow(input?: CardTypeInput) {
  return cardTypeLabel(input).toUpperCase();
}
