import { extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import { specificWeekendSpecialty } from "@/lib/station/weekendRoundup";
import { buildClinicalEvidencePackaging, buildMultiJournalClubYoutubeTitle } from "@/lib/youtube/clinicalEvidencePackaging";
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
  const packaging = buildClinicalEvidencePackaging({
    title: resolved[0]?.segment.title ?? TITLE,
    specialty: specialties[0] ?? "Multispecialty",
    explicitTopic: specialties[0],
    sourceText: resolved.map(({ segment }) => [segment.title, segment.summary, segment.script].filter(Boolean).join("\n")).join("\n"),
    studyNames,
    multiTopic: specialties.length > 1
  });
  const title = buildMultiJournalClubYoutubeTitle(packaging.youtubeTitle, specialties);
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
    "JOURNAL CLUB",
    `Relevant specialties: ${specialties.join("; ")}.`,
    `${TITLE} — Part ${part}`,
    `Featured trials and studies: ${featured}.`,
    `Journals: ${journals.join("; ")}.`,
    "ConferenceHype selected these evidence-rich cards from journal articles actually covered during the Monday-Friday broadcast week.",
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
    clinicalTopic: packaging.clinicalTopic,
    thumbnailHeadline: packaging.thumbnailHook,
    thumbnailHook: packaging.thumbnailHook,
    thumbnailEntity: packaging.thumbnailEntity,
    thumbnailJournalNames: journals.slice(0, 2),
    thumbnailJournalCount: journals.length,
    relevantSpecialties: specialties
  };
}

export function assertWeekendRoundupMetadata(metadata: BroadcastMetadata) {
  if (!metadata.title.startsWith("JOURNAL CLUB | ")) throw new Error("Weekend roundup title must begin with JOURNAL CLUB and its specialties.");
  if (!metadata.relevantSpecialties?.length) throw new Error("Weekend roundup must resolve at least one relevant specialty.");
  for (const specialty of metadata.relevantSpecialties) {
    if (!metadata.title.includes(specialty)) throw new Error(`Weekend roundup title is missing specialty ${specialty}.`);
    if (!metadata.description.includes(`Relevant specialties: ${metadata.relevantSpecialties.join("; ")}.`)) {
      throw new Error("Weekend roundup description must list every resolved specialty.");
    }
  }
  for (const label of ["JOURNAL CLUB", "Featured trials and studies:", "Relevant specialties:", "Journals:"]) {
    if (!metadata.description.includes(label)) throw new Error(`Weekend metadata is missing ${label}`);
  }
  if (!metadata.tags.includes("Weekend Medical Roundup")) throw new Error("Weekend roundup SEO tag is missing.");
  if (!metadata.thumbnailHeadline) throw new Error("Weekend roundup thumbnail headline is missing.");
  if (!metadata.thumbnailJournalNames?.length || !metadata.thumbnailJournalCount) throw new Error("Weekend roundup thumbnail journals are missing.");
  return metadata;
}
