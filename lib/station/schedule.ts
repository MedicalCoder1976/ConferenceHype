import type { EntityCardDeck } from "@/lib/cardDeck";
import type { OncologyJournal } from "@/lib/types";
import type { StationProgram } from "@/lib/station/types";

export const STATION_PROGRAMS_PER_CYCLE = 6;
export const STATION_NEW_PROGRAMS_PER_WEEKDAY = 1;
export const STATION_PROGRAM_MINUTES = 30;
export const STATION_CYCLE_MINUTES = 180;
export const STATION_BREAK_IN_MINUTES = 15;
export const STATION_MAX_RESERVED_CARDS = 12;

export type StationProgramDraft = Pick<
  StationProgram,
  | "position"
  | "specialty"
  | "journalId"
  | "journalName"
  | "programType"
  | "sourceProgramId"
  | "startsAtOffsetMinutes"
  | "durationMinutes"
  | "status"
  | "cardIds"
  | "youtubeVideoId"
  | "youtubeUrl"
  | "title"
  | "description"
  | "writeoutCards"
>;

function specificJournalSpecialty(journal: Pick<OncologyJournal, "name" | "specialty">) {
  if (journal.specialty && journal.specialty !== "Others") return journal.specialty;
  const name = journal.name.toLowerCase();
  if (/(neurolog|neurosurg)/.test(name)) return "Neurology";
  if (/psychiatr/.test(name)) return "Psychiatry";
  if (/ophthalm/.test(name)) return "Ophthalmology";
  if (/(thorax|pulmon|respir)/.test(name)) return "Pulmonology";
  if (/endocrin/.test(name)) return "Endocrinology";
  return "Medical Journal";
}
export function nextBreakInBoundary(
  now: Date,
  placement: "top" | "bottom"
) {
  const boundary = new Date(now);
  boundary.setUTCSeconds(0, 0);
  if (placement === "top") {
    boundary.setUTCMinutes(0);
    boundary.setUTCHours(boundary.getUTCHours() + 1);
  } else {
    if (now.getUTCMinutes() < 30) {
      boundary.setUTCMinutes(30);
    } else {
      boundary.setUTCMinutes(30);
      boundary.setUTCHours(boundary.getUTCHours() + 1);
    }
  }
  return boundary;
}

export function stationHasStartedToday(
  now: Date,
  cycleStartMinutes = 0,
  timeZone = "America/New_York"
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute") >= cycleStartMinutes;
}

export function stationPositionAt(
  now: Date,
  cycleStartMinutes = 0,
  timeZone = "America/New_York"
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const minuteOfDay = value("hour") * 60 + value("minute");
  const elapsed =
    (minuteOfDay - cycleStartMinutes + 24 * 60) % STATION_CYCLE_MINUTES;
  return Math.floor(elapsed / STATION_PROGRAM_MINUTES);
}

export function buildStationDraft({
  scheduleDate: _scheduleDate,
  journals,
  journalCardDecks,
  excludedJournalIds = [],
  excludedCardIds = [],
  programCount = STATION_PROGRAMS_PER_CYCLE
}: {
  scheduleDate: string;
  journals: OncologyJournal[];
  journalCardDecks: Record<string, EntityCardDeck>;
  replayPrograms?: StationProgram[];
  excludedJournalIds?: string[];
  excludedCardIds?: string[];
  programCount?: number;
}): StationProgramDraft[] {
  const excludedJournals = new Set(excludedJournalIds);
  const excludedCards = new Set(excludedCardIds);
  const candidates = journals
    .filter((journal) => journal.enabled && journal.specialty && !excludedJournals.has(journal.id))
    .map((journal) => ({
      journal,
      specialty: specificJournalSpecialty(journal),
      readyCards: (journalCardDecks[journal.id]?.cards ?? []).filter(({ segment }) => !excludedCards.has(segment.id))
    }))
    .filter(({ readyCards }) => readyCards.length > 0)
    .sort((a, b) => b.readyCards.length - a.readyCards.length || a.journal.name.localeCompare(b.journal.name));

  const selected: typeof candidates = [];
  const specialties = new Set<string>();
  for (const candidate of candidates) {
    if (selected.length === programCount) break;
    if (specialties.has(candidate.specialty)) continue;
    selected.push(candidate);
    specialties.add(candidate.specialty);
  }
  for (const candidate of candidates) {
    if (selected.length === programCount) break;
    if (!selected.some(({ journal }) => journal.id === candidate.journal.id)) selected.push(candidate);
  }
  if (selected.length !== programCount) return [];

  return selected.map(({ journal, specialty, readyCards }, position) => ({
    position,
    specialty,
    journalId: journal.id,
    journalName: journal.name,
    programType: "new",
    sourceProgramId: undefined,
    startsAtOffsetMinutes: position * STATION_PROGRAM_MINUTES,
    durationMinutes: 30,
    status: "planned",
    cardIds: readyCards.map(({ segment }) => segment.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, STATION_MAX_RESERVED_CARDS),
    youtubeVideoId: undefined,
    youtubeUrl: undefined,
    title: undefined,
    description: undefined,
    writeoutCards: []
  }));
}
