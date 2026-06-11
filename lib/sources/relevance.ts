import type { IngestedItem } from "@/lib/types";

const conferenceKeywords = [
  "asco",
  "oncology",
  "cancer",
  "tumor",
  "trial",
  "abstract",
  "poster",
  "plenary",
  "biotech",
  "pharma",
  "fda",
  "drug",
  "breast",
  "lung",
  "hematologic",
  "melanoma",
  "lymphoma",
  "leukemia",
  "myeloma",
  "eha",
  "sponsor",
  "exhibitor"
];

const blockedPatterns = [
  /tap-en/i,
  /\bads?\b/i,
  /client preview/i,
  /settings/i
];

export function isRelevantItem(item: IngestedItem) {
  if (item.sourceType === "official" || item.sourceType.includes("social")) {
    return true;
  }
  const haystack = `${item.title} ${item.excerpt} ${item.url}`.toLowerCase();
  if (blockedPatterns.some((pattern) => pattern.test(haystack))) {
    return false;
  }
  return conferenceKeywords.some((keyword) => haystack.includes(keyword));
}
