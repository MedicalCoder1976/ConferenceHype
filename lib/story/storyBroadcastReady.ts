import { filterBroadcastReadySegments, findUnsafeRundownTerm } from "@/lib/data";
import type { Segment } from "@/lib/types";

// The render's quality gate requires every Story card to survive
// filterBroadcastReadySegments(); one dropped card (e.g. a closing sentence
// containing "verify") failed a real GitHub render 4 minutes in with only
// "11 ... 12 are required". Run the same filter before dispatch and name the
// card and the blocked word instead.
export function assertStoryCardsBroadcastReady(segments: Segment[]) {
  const content = segments.filter((segment) => !segment.riskFlags.includes("prepared_disclaimer"));
  const ready = new Set(filterBroadcastReadySegments(content).map((segment) => segment.id));
  const rejected = content.filter((segment) => !ready.has(segment.id));
  if (rejected.length === 0) return;
  const details = rejected.map((segment) => {
    const position = segment.riskFlags.find((flag) => flag.startsWith("prepared_card:"))?.split(":")[1] ?? "?";
    const term = findUnsafeRundownTerm(`${segment.summary}\n${segment.script}`);
    return `card ${position} ("${segment.title}")${term ? ` because it contains the blocked word "${term}"` : " because it failed the broadcast source/safety filter"}`;
  });
  throw new Error(`The broadcast filter would drop ${details.join("; ")}. Reword it and try again.`);
}
