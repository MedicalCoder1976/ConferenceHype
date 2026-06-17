import type { Segment } from "@/lib/types";

export function makeScheduledCopy({
  source,
  approvedAt,
  script
}: {
  source: Segment;
  approvedAt: string;
  script: string;
}): Segment {
  const now = new Date().toISOString();
  return {
    ...source,
    id: `scheduled-copy-${source.id}-${Date.now()}`,
    script,
    status: "approved",
    approvedAt,
    riskFlags: Array.from(
      new Set([
        ...source.riskFlags,
        "reusable_ready_card_copy",
        `source_segment:${source.id}`
      ])
    ),
    createdAt: now,
    updatedAt: now
  };
}
