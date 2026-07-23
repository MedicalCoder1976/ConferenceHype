import type { EntityCardDeck } from "@/lib/cardDeck";
import type { OncologyJournal } from "@/lib/types";
import type { StationProgram } from "@/lib/station/types";

export const STATION_PROGRAMS_PER_CYCLE = 6;
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

function dayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
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
  scheduleDate,
  journals,
  journalCardDecks,
  replayPrograms = []
}: {
  scheduleDate: string;
  journals: OncologyJournal[];
  journalCardDecks: Record<string, EntityCardDeck>;
  replayPrograms?: StationProgram[];
}): StationProgramDraft[] {
  const enabled = journals.filter((journal) => journal.enabled && journal.specialty);
  const specialties = [...new Set(enabled.map((journal) => journal.specialty!))].sort();
  if (specialties.length === 0) return [];

  const start = (dayNumber(scheduleDate) * STATION_PROGRAMS_PER_CYCLE) % specialties.length;
  const selectedSpecialties = Array.from(
    { length: Math.min(STATION_PROGRAMS_PER_CYCLE, specialties.length) },
    (_, index) => specialties[(start + index) % specialties.length]
  );

  return selectedSpecialties.map((specialty, position) => {
    const candidates = enabled
      .filter((journal) => journal.specialty === specialty)
      .sort((a, b) => {
        const cardDifference =
          (journalCardDecks[b.id]?.total ?? 0) - (journalCardDecks[a.id]?.total ?? 0);
        if (cardDifference !== 0) return cardDifference;
        return a.name.localeCompare(b.name);
      });
    const journal = candidates[0];
    const readyCards = journal ? journalCardDecks[journal.id]?.cards ?? [] : [];
    const journalReplay = replayPrograms.find(
      (program) => program.journalId === journal?.id && program.status === "verified"
    );
    const specialtyReplay = replayPrograms.find(
      (program) => program.specialty === specialty && program.status === "verified"
    );
    const replay = journalReplay ?? specialtyReplay;
    const hasNewContent = readyCards.length > 0;

    return {
      position,
      specialty,
      journalId: hasNewContent ? journal?.id : replay?.journalId ?? journal?.id,
      journalName: hasNewContent
        ? journal?.name ?? specialty
        : replay?.journalName ?? journal?.name ?? `${specialty} replay`,
      programType: hasNewContent
        ? "new"
        : journalReplay
          ? "journal_replay"
          : specialtyReplay
            ? "specialty_replay"
            : "fallback",
      sourceProgramId: hasNewContent ? undefined : replay?.id,
      startsAtOffsetMinutes: position * STATION_PROGRAM_MINUTES,
      durationMinutes: 30,
      status: hasNewContent ? "planned" : replay ? "verified" : "failed",
      cardIds: hasNewContent
        ? readyCards
            .map(({ segment }) => segment.id)
            .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
            .slice(0, STATION_MAX_RESERVED_CARDS)
        : replay?.cardIds ?? [],
      youtubeVideoId: hasNewContent ? undefined : replay?.youtubeVideoId,
      youtubeUrl: hasNewContent ? undefined : replay?.youtubeUrl,
      title: hasNewContent ? undefined : replay?.title,
      description: hasNewContent ? undefined : replay?.description,
      writeoutCards: hasNewContent ? [] : replay?.writeoutCards ?? []
    };
  });
}
