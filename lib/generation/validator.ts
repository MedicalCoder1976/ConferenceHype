import type { Segment } from "@/lib/types";
import { getUnsafeReviewSourceErrors } from "@/lib/generation/sourceSafety";
import { hasMissingIntakeFailureLanguage } from "@/lib/broadcast/sanitizeCopy";

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
  if (hasMissingIntakeFailureLanguage(`${segment.title}\n${segment.summary}\n${segment.script}`)) {
    errors.push("Card contains missing-intake failure language and must be replaced with music or regenerated from selected sources.");
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
