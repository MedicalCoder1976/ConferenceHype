import { extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import { specificWeekendSpecialty } from "@/lib/station/weekendRoundup";
import type { BroadcastSlot } from "@/lib/rundown/slots";
import type { BroadcastMetadata } from "@/lib/youtube/broadcastMetadata";
import type { OncologyJournal } from "@/lib/types";

const TITLE = "Weekend Roundup of Top Medical Journal Articles of the Week";
const MAX_TAG_LENGTH = 30;
const MAX_TAGS_TOTAL_CHARS = 500;

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

export function buildWeekendRoundupMetadata({
  hourStart,
  slots,
  journalsById,
  part,
  studySourceTextBySegmentId = new Map<string, string>()
}: {
  hourStart: Date;
  slots: BroadcastSlot[];
  journalsById: Map<string, OncologyJournal>;
  part: number;
  studySourceTextBySegmentId?: Map<string, string>;
}): BroadcastMetadata {
  const cards = slots.filter((slot) => slot.segment && !slot.segment.riskFlags.includes("weekend_roundup_outro") && !slot.segment.riskFlags.includes("journal_show_disclaimer"));
  const resolved = cards.map((slot) => {
    const segment = slot.segment!;
    const citation = segment.citations.find((item) => item.journalId);
    const journal = citation?.journalId ? journalsById.get(citation.journalId) : undefined;
    const specialty = journal ? specificWeekendSpecialty(journal) : undefined;
    const studyNames = extractExplicitStudyNames([
      segment.title,
      segment.summary,
      citation?.label ?? "",
      studySourceTextBySegmentId.get(segment.id) ?? ""
    ].join(" "));
    return { slot, segment, journal, specialty, studyNames };
  });
  const studyNames = unique(resolved.flatMap((item) => item.studyNames)).slice(0, 8);
  const specialties = unique(resolved.map((item) => item.specialty ?? ""));
  const journals = unique(resolved.map((item) => item.journal?.name ?? ""));
  const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(hourStart);
  const title = `${TITLE} | Part ${part} | ${dateLabel}`;
  const featured = studyNames.length ? studyNames.join("; ") : "Article titles and PubMed citations are listed in the chapters below";
  const chapters = resolved.map(({ slot, segment, journal, specialty }) => {
    const elapsed = (slot.at.getTime() - hourStart.getTime()) / 1000;
    return `${timestamp(elapsed)} ${segment.title} | ${journal?.name ?? "Medical journal"} | ${specialty ?? "Medicine"}`;
  });
  const tags = makeTags([
    ...studyNames,
    ...specialties,
    ...journals,
    "Weekend Medical Roundup",
    "Top Medical Articles",
    "Medical Journal Review",
    "Clinical Trials",
    "Medical Education",
    "ConferenceHype"
  ]);
  const description = [
    `${TITLE} — Part ${part}`,
    `Featured trials and studies: ${featured}.`,
    `Specialties: ${specialties.join("; ")}.`,
    `Journals: ${journals.join("; ")}.`,
    "ConferenceHype selected these source-grounded cards from journal articles actually covered during the Monday-Friday broadcast week.",
    "",
    ...chapters,
    "",
    ...tags.slice(0, 6).map((tag) => `#${tag.replace(/\s+/g, "")}`)
  ].join("\n");
  return {
    title,
    description,
    tags,
    categoryId: "27",
    tier: "roundup",
    specialty: "Multispecialty",
    dateLabel,
    studyNames,
    thumbnailHeadline: "Top Medical Studies This Week"
  };
}

export function assertWeekendRoundupMetadata(metadata: BroadcastMetadata) {
  if (!metadata.title.startsWith(TITLE)) throw new Error("Weekend roundup title is missing.");
  for (const label of ["Featured trials and studies:", "Specialties:", "Journals:"]) {
    if (!metadata.description.includes(label)) throw new Error(`Weekend metadata is missing ${label}`);
  }
  if (!metadata.tags.includes("Weekend Medical Roundup")) throw new Error("Weekend roundup SEO tag is missing.");
  if (metadata.thumbnailHeadline !== "Top Medical Studies This Week") throw new Error("Weekend roundup thumbnail headline is missing.");
  return metadata;
}