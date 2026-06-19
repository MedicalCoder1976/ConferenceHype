import type { IngestedItem } from "@/lib/types";

export function isGenericConferenceLandingItem(item: IngestedItem) {
  return Boolean(
    item.sourceId?.startsWith("daily-conference-") &&
      /\b(?:ASCO Meetings|meetings?|annual meeting|program guide)\b/i.test(
        `${item.title} ${item.sourceName}`
      ) &&
      !/\b(background|methods|results|discussion|abstract|trial|phase|cohort|study|endpoint)\b/i.test(
        item.excerpt
      )
  );
}
