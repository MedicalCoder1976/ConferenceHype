import { extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import type { OncologyJournal, Segment } from "@/lib/types";

export const WEEKEND_PROGRAMS_PER_DAY = 2;
export const WEEKEND_CARDS_PER_PROGRAM = 12;
export const WEEKEND_CYCLE_START_MINUTES = 9 * 60;

export type WeekendCandidate = {
  segment: Segment;
  journal: OncologyJournal;
  specialty: string;
  studyNames: string[];
  score: number;
};

export function specificWeekendSpecialty(journal: Pick<OncologyJournal, "name" | "specialty">) {
  if (journal.specialty && journal.specialty !== "Others") return journal.specialty;
  const name = journal.name.toLowerCase();
  if (/(neurolog|neurosurg)/.test(name)) return "Neurology";
  if (/psychiatr/.test(name)) return "Psychiatry";
  if (/ophthalm/.test(name)) return "Ophthalmology";
  if (/(thorax|pulmon|respir)/.test(name)) return "Pulmonology";
  if (/endocrin/.test(name)) return "Endocrinology";
  if (/(obstet|gynecol|gynaecol)/.test(name)) return "ObGyn";
  return "Medical Journal";
}

function weekendScore(segment: Segment, studyNames: string[], sourceText: string) {
  const text = `${segment.title} ${segment.summary} ${segment.script} ${sourceText}`;
  let score = segment.confidenceScore ?? 0;
  if (segment.riskFlags.includes("journal_quality_passed")) score += 40;
  if (segment.riskFlags.includes("structured_article_card")) score += 15;
  score += Math.min(studyNames.length, 3) * 45;
  if (/\b(?:randomi[sz]ed|phase\s+[1-4]|clinical trial|controlled trial)\b/i.test(text)) score += 30;
  if (/\b(?:overall survival|progression-free survival|mortality|response rate|hazard ratio|practice-changing)\b/i.test(text)) score += 24;
  if (/\b(?:multicenter|systematic review|meta-analysis|prospective)\b/i.test(text)) score += 12;
  if (/\b(?:NCT\s*[-:]?\s*\d{6,}|ISRCTN\s*[-:]?\s*\d{6,}|ACTRN\s*[-:]?\s*\d{8,})\b/i.test(text)) score += 35;
  if (/\b(?:Results|Discussion)\s*:/i.test(text)) score += 8;
  if (/\d/.test(segment.summary)) score += 5;
  return score;
}

export function rankWeekendCandidates({
  segments,
  journalsById,
  sourceTextBySegmentId = new Map<string, string>(),
  excludedSegmentIds = new Set<string>()
}: {
  segments: Segment[];
  journalsById: Map<string, OncologyJournal>;
  sourceTextBySegmentId?: Map<string, string>;
  excludedSegmentIds?: Set<string>;
}) {
  const seen = new Set<string>();
  const candidates: WeekendCandidate[] = [];
  for (const segment of segments) {
    if (excludedSegmentIds.has(segment.id) || seen.has(segment.id)) continue;
    seen.add(segment.id);
    const citation = segment.citations.find((item) => item.journalId);
    const journal = citation?.journalId ? journalsById.get(citation.journalId) : undefined;
    if (!journal || !segment.riskFlags.includes("journal_quality_passed")) continue;
    const sourceText = sourceTextBySegmentId.get(segment.id) ?? "";
    const studyNames = extractExplicitStudyNames([
      segment.title,
      segment.summary,
      segment.script,
      citation?.label ?? "",
      sourceText
    ].join(" "));
    candidates.push({
      segment,
      journal,
      specialty: specificWeekendSpecialty(journal),
      studyNames,
      score: weekendScore(segment, studyNames, sourceText)
    });
  }
  return candidates.sort((left, right) =>
    right.score - left.score ||
    right.studyNames.length - left.studyNames.length ||
    left.segment.title.localeCompare(right.segment.title)
  );
}

export function splitWeekendPrograms(
  ranked: WeekendCandidate[],
  cardsPerProgram = WEEKEND_CARDS_PER_PROGRAM
) {
  const selected = ranked.slice(0, cardsPerProgram * WEEKEND_PROGRAMS_PER_DAY);
  const programs: WeekendCandidate[][] = [[], []];
  selected.forEach((candidate, index) => programs[index % WEEKEND_PROGRAMS_PER_DAY].push(candidate));
  return programs;
}