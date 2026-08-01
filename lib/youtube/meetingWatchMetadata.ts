import { extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { BroadcastMetadata } from "@/lib/youtube/broadcastMetadata";

const MAX_TAG_LENGTH = 30;
const MAX_TAGS_TOTAL_CHARS = 500;
const MAX_HEADLINE_LENGTH = 68;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function makeTags(values: string[]) {
  const tags: string[] = [];
  let chars = 0;
  for (const value of unique(values)) {
    const tag = truncate(value, MAX_TAG_LENGTH);
    const cost = tag.length + 3;
    if (chars + cost > MAX_TAGS_TOTAL_CHARS) continue;
    tags.push(tag);
    chars += cost;
  }
  return tags;
}

// The admin-authored title (already a strong, keyword-led headline set at
// scheduling time -- see components/MeetingWatchDesk.tsx) is kept as-is;
// this rebuilds the description fresh from the cards that actually
// rendered, the same "resolve from real output, not from what was planned"
// principle every other broadcast format already follows. Real per-card
// timestamps (not available until now, since exact timing depends on real
// Kokoro durations) make the description's chapters genuinely useful --
// YouTube surfaces timestamped chapters as clickable jump points, which
// both increases watch time (the algorithm's strongest ranking signal) and
// gives searchers something concrete to click into from results.
export function buildMeetingWatchMetadata({
  hourStart,
  slots,
  title,
  meetingLabel,
  specialty,
  sourceUrl
}: {
  hourStart: Date;
  slots: BroadcastSlot[];
  title: string;
  meetingLabel: string;
  specialty?: string;
  sourceUrl: string;
}): BroadcastMetadata {
  const seenPreparedCards = new Set<string>();
  const cards = slots.filter((slot) => {
    if (!slot.segment || slot.segment.riskFlags.includes("meeting_watch_outro") || slot.segment.riskFlags.includes("meeting_watch_disclaimer") || slot.segment.riskFlags.includes("prepared_disclaimer") || slot.segment.riskFlags.includes("prepared_closing")) return false;
    const preparedCard = slot.segment.riskFlags.find((flag) => flag.startsWith("prepared_card:"));
    if (!preparedCard) return true;
    if (seenPreparedCards.has(preparedCard)) return false;
    seenPreparedCards.add(preparedCard);
    return true;
  });
  const resolved = cards.map((slot) => {
    const segment = slot.segment!;
    // Every Meeting Watch card title is generated as "TRIAL NAME: rest"
    // (lib/generation/llm.ts's generateCardsFromSource prompt requires it) --
    // pulling the name straight from that structure is far more reliable
    // than regex-guessing over prose, and guarantees one name per card
    // instead of the noisy, duplicate-prone matches free-text extraction
    // produced (e.g. "CLL-314 trial" and "CLL-314 study" as if different).
    const [prefix, ...rest] = segment.title.split(":");
    const structuredName = rest.length > 0 ? prefix.trim() : undefined;
    const studyNames = structuredName ? [structuredName] : extractExplicitStudyNames(`${segment.title} ${segment.script}`);
    return { slot, segment, studyNames };
  });
  const studyNames = unique(resolved.flatMap((item) => item.studyNames)).slice(0, 10);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  }).format(hourStart);
  const featured = studyNames.length ? studyNames.join("; ") : "full study breakdown in the chapters below";
  const chapters = resolved.map(({ slot, segment }) => {
    const elapsed = (slot.at.getTime() - hourStart.getTime()) / 1000;
    return `${timestamp(elapsed)} ${segment.title}`;
  });
  const tags = makeTags([
    ...studyNames,
    meetingLabel,
    specialty ?? "",
    "Medical Conference",
    "Clinical Trials",
    "Medical Education",
    "Meeting Watch",
    "ConferenceHype"
  ]);
  const headline = truncate(title.replace(/^ConferenceHype:\s*/, "").split(" - ")[0], MAX_HEADLINE_LENGTH);
  const description = [
    studyNames.length ? `Studies covered: ${featured}.` : "",
    `This ConferenceHype Meeting Watch broadcast recaps real ${meetingLabel} findings${specialty ? ` in ${specialty}` : ""} -- no fabricated claims, built for physicians, NPs, and PAs who don't have time to read every abstract themselves.`,
    `Full source: ${sourceUrl}`,
    "",
    ...chapters,
    "",
    "New Meeting Watch broadcasts drop every time a major conference wraps -- subscribe with notifications on so you don't miss the next one.",
    "",
    // Hashtags come from the untruncated study names, not the 30-char
    // tags[] (built for YouTube's separate tag field) -- reusing that list
    // put a literal "…" mid-hashtag on any name over 30 chars, plus raw
    // "/" from names like "INCA033989-101/-102". Non-alphanumeric
    // characters are stripped entirely since a hashtag isn't a free-text
    // field the way the title/description prose is.
    ...[...studyNames, meetingLabel, "ConferenceHype"]
      .slice(0, 6)
      .map((value) => `#${value.replace(/[^a-zA-Z0-9]/g, "")}`)
      .filter((tag) => tag.length > 1)
  ]
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n");
  return {
    title,
    description,
    tags,
    categoryId: "27",
    tier: "roundup",
    specialty,
    dateLabel,
    studyNames,
    thumbnailHeadline: headline,
    thumbnailJournalNames: undefined,
    thumbnailJournalCount: undefined
  };
}
