import { hasExplicitClinicalStructure } from "@/lib/segments/sectionSummary";
import type { PubMedJournalArticle } from "@/lib/sources/pubmed";

export type JournalArticleEligibility = {
  status:
    | "eligible"
    | "awaiting_abstract"
    | "excluded_erratum"
    | "excluded_retraction"
    | "excluded_title_only"
    | "excluded_insufficient_content";
  reason: string;
};

export type JournalCardQualityReport = {
  passed: boolean;
  errors: string[];
  checks: Record<string, "pass" | "fail" | "not_applicable">;
};

const exclusionType = (types: string[], pattern: RegExp) =>
  types.some((type) => pattern.test(type));

export function classifyJournalArticle(article: PubMedJournalArticle): JournalArticleEligibility {
  if (exclusionType(article.publicationTypes, /retracted publication|retraction of publication/i)) {
    return { status: "excluded_retraction", reason: "PubMed publication type identifies a retraction." };
  }
  if (exclusionType(article.publicationTypes, /erratum|published erratum|correction/i)) {
    return { status: "excluded_erratum", reason: "PubMed publication type identifies an erratum or correction." };
  }
  if (!article.abstract.trim()) {
    return { status: "awaiting_abstract", reason: "PubMed record exists but no abstract is currently available." };
  }
  if (!article.title.trim()) {
    return { status: "excluded_title_only", reason: "The PubMed record has no usable title." };
  }
  const wordCount = article.abstract.trim().split(/\s+/).length;
  if (wordCount < 45) {
    return { status: "excluded_insufficient_content", reason: `Abstract has only ${wordCount} words.` };
  }
  return { status: "eligible", reason: "Complete PubMed abstract is suitable for deterministic card creation." };
}

function section(text: string, label: string) {
  return text.match(
    new RegExp(`\\b${label}\\b\\s*:\\s*([\\s\\S]*?)(?=\\b(?:Background|Methods|Results|Discussion)\\b\\s*:|$)`, "i")
  )?.[1]?.trim() ?? "";
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3));
}

function similarity(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size);
}

function brokenBoundary(value: string) {
  const trimmed = value.trim();
  return (
    /^[a-z]/.test(trimmed) ||
    /\b(?:and|or|versus|vs|with|of|to|for|the)\.?$/i.test(trimmed) ||
    /\band\.$/i.test(trimmed)
  );
}

export function validateJournalCardCopy({
  script,
  structured
}: {
  script: string;
  structured: boolean;
}): JournalCardQualityReport {
  const errors: string[] = [];
  const checks: JournalCardQualityReport["checks"] = {};
  const rawLabelLeak = /\b(?:OBJECTIVES?|FINDINGS|CONCLUSIONS?|PURPOSE|IMPORTANCE)\s*:/i.test(script);
  checks.raw_label_cleanup = rawLabelLeak ? "fail" : "pass";
  if (rawLabelLeak) errors.push("Raw structured-abstract label leaked into card copy.");

  if (structured) {
    const values = ["Background", "Methods", "Results", "Discussion"].map((label) => ({ label, value: section(script, label) }));
    const complete = values.every(({ value }) => value.length >= 20);
    checks.section_completeness = complete ? "pass" : "fail";
    if (!complete) errors.push("Structured research card is missing a substantive required section.");
    const broken = values.filter(({ value }) => brokenBoundary(value));
    checks.sentence_integrity = broken.length ? "fail" : "pass";
    if (broken.length) errors.push(`Broken sentence boundary in ${broken.map(({ label }) => label).join(", ")}.`);
    const resultText = section(script, "Results");
    const discussionText = section(script, "Discussion");
    const duplicate = similarity(resultText, discussionText) >= 0.82;
    checks.results_discussion_distinct = duplicate ? "fail" : "pass";
    if (duplicate) errors.push("Results and Discussion are substantially duplicated.");
  } else {
    checks.section_completeness = "not_applicable";
    checks.results_discussion_distinct = "not_applicable";
    const broken = brokenBoundary(script);
    checks.sentence_integrity = broken ? "fail" : "pass";
    if (broken) errors.push("Narrative card has a broken sentence boundary.");
  }

  return { passed: errors.length === 0, errors, checks };
}

export function isStructuredJournalArticle(article: PubMedJournalArticle) {
  const narrativeType = exclusionType(article.publicationTypes, /editorial|comment|letter|news|biography/i);
  return !narrativeType && hasExplicitClinicalStructure(article.abstract);
}