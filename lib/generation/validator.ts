import type { Segment } from "@/lib/types";
import { getUnsafeReviewSourceErrors } from "@/lib/generation/sourceSafety";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";
import {
  hasSourceLimitedScienceLanguage,
  hasUsableClinicalSectionSource
} from "@/lib/segments/sectionSummary";

function isClinicalScienceCard(segment: Pick<Segment, "title" | "summary" | "script" | "contentType">) {
  // Social posts are attributed callouts, not full studies — they're held to
  // the social-signal labeling rule below instead of the science-card rule,
  // even when their text mentions clinical terms (near-certain for any
  // hematology/oncology conference account's posts).
  if (segment.contentType === "social_signal") {
    return false;
  }
  const text = `${segment.title} ${segment.summary} ${segment.script}`;
  return (
    segment.contentType === "abstract_buzz" ||
    /\b(abstract|clinical\s+trial|trial|randomized|phase\s?(?:i|ii|iii|iv|1|2|3|4)|cohort|study|results?|endpoint|survival|response|pfs|os|mrd|biomarker|lymphoma|leukemia|myeloma|cancer|oncology)\b/i.test(text)
  );
}

function hasFourSectionLabels(text: string) {
  return (
    /\bBackground\b\s*[:,-]/i.test(text) &&
    /\bMethods\b\s*[:,-]/i.test(text) &&
    /\bResults\b\s*[:,-]/i.test(text) &&
    /\bDiscussion\b\s*[:,-]/i.test(text)
  );
}

function isEmptyConferenceInformationCard(segment: Pick<Segment, "title" | "summary" | "script" | "contentType">) {
  const text = `${segment.title} ${segment.summary} ${segment.script}`;
  return (
    segment.contentType === "agenda_preview" &&
    (hasFourSectionLabels(text) || /\b(official\s+program\s+intake|clinical\s+practice\s+our\s+guidelines|learning\s+paths\s+european\s+hematology\s+curriculum|monitoring\s+and\s+career\s+development|specialized\s+working\s+groups|ebah\s+cme\s+credits|topics-in-focus\s+program)\b/i.test(text)) &&
    /\b(registration|register\s+virtually|platform|onboarding|thank\s+you\s+for\s+joining|official\s+meeting\s+context|conference\s+context|is\s+listed\s+as\s+a|source:\s+the\s+official\s+meeting\s+page|topics-in-focus|congress\s+platform|clinical\s+practice|guidelines|learning\s+paths|curriculum|working\s+groups|cme\s+credits)\b/i.test(text) &&
    !/\b(objective|patients?|randomi[sz]ed|trial|cohort|endpoint|survival|response|hazard\s+ratio|confidence\s+interval|p\s*[<=>]|median|primary\s+endpoint|secondary\s+endpoint)\b/i.test(text)
  );
}

const bannedAdvicePatterns = [
  /\bpatients should\b/i,
  /\bclinicians should\b/i,
  /\bdoctors should\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bhold\b/i,
  /\bwill move\b/i,
  /\bguaranteed\b/i
];

export function validateSegmentForApproval(segment: Pick<Segment, "title" | "summary" | "script" | "citations" | "contentType" | "riskFlags">) {
  const errors: string[] = [];
  // agenda_preview and industry_floor are always sourced from verified official
  // schedule/floor data, so they are trusted without a citation list.
  // This matches the filterBroadcastReadySegments() exemption in lib/data.ts.
  const citationRequired =
    segment.contentType !== "agenda_preview" && segment.contentType !== "industry_floor";
  if (citationRequired && segment.citations.length === 0) {
    errors.push("At least one citation is required before approval.");
  }
  errors.push(...getUnsafeReviewSourceErrors(segment));
  const combinedText = `${segment.title}\n${segment.summary}\n${segment.script}`;
  if (hasMissingIntakeFailureLanguage(combinedText)) {
    errors.push("Card contains missing-intake failure language and must be replaced with music or regenerated from selected sources.");
  }
  // Smoke-test placeholder cards are deliberately synthetic scaffolding for
  // exercising the broadcast pipeline, not real editorial content, so the
  // content-quality heuristics below (which assume real source material)
  // don't apply to them — only the structural checks above and below do.
  const isSmokeTestCard = segment.riskFlags.includes("platform_smoke_test");
  // Narrative reviews/editorials/commentaries have no real Methods or
  // Results to extract -- they are deliberately built without the four
  // section labels (see buildBatchSegment's narrativeReview branch), so they
  // are exempt from the structured-section requirement below. They still
  // must clear the listing-metadata/fabrication check.
  const isNarrativeReviewCard = segment.riskFlags.includes("narrative_review_card");
  // Conference and journal announcement/context cards (e.g., "no new content
  // this week") mention the entity's specialty (oncology, hematology) in
  // passing, which trips isClinicalScienceCard — but they are NOT actual
  // clinical trial reporting, so the structured-section requirement does not
  // apply. These cards are pre-validated at generation time in
  // buildConferenceAnnouncementSegment / buildJournalAnnouncementSegment.
  const isWeeklyContextCard = segment.riskFlags.includes("weekly_source_context");
  if (!isSmokeTestCard && !isWeeklyContextCard && isClinicalScienceCard(segment)) {
    if (hasSourceLimitedScienceLanguage(combinedText)) {
      errors.push("Science cards with only listing metadata must be replaced with music or regenerated from PubMed/full source text; do not infer Background, Methods, Results, or Discussion.");
    } else if (!isNarrativeReviewCard && !hasUsableClinicalSectionSource(`${segment.summary} ${segment.script}`)) {
      errors.push("Science cards require source-grounded Background, Methods, Results, and Discussion before approval.");
    }
  }
  if (!isSmokeTestCard && isEmptyConferenceInformationCard(segment)) {
    errors.push("Conference coverage cards with only registration, platform, welcome, or context-shell information must not enter the broadcast queue; use music unless substantive source-grounded material is available.");
  }
  for (const pattern of bannedAdvicePatterns) {
    if (pattern.test(segment.script)) {
      errors.push(`Script contains disallowed advice language: ${pattern}`);
    }
  }
  if (
    segment.contentType === "social_signal" &&
    !/\b(posted|claimed|reacted|discussed|social buzz|source-backed|monitored X|X narrative|X voice|@\w{1,15})\b/i.test(
      segment.script
    )
  ) {
    errors.push("Social signal scripts must be labeled as attributed posts or monitored X narratives.");
  }
  if (
    segment.riskFlags.includes("sponsor_message") &&
    !/\b(sponsored|sponsor message|paid content)\b/i.test(
      `${segment.title}\n${segment.summary}\n${segment.script}`
    )
  ) {
    errors.push("Sponsor cards must be explicitly labeled as sponsored or paid content.");
  }
  return errors;
}
