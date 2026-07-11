import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function todayAtPlanningEastern(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${value("year")}-${value("month")}-${value("day")}T21:00:00-04:00`);
}

function parseStart() {
  const start = process.argv[2] ?? process.env.STREAM_PREVIEW_START ?? "today-21";
  if (start === "today-noon" || start === "today-21") {
    return todayAtPlanningEastern();
  }
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid preview start: ${start}`);
  }
  return parsed;
}

async function main() {
  const [
    { filterBroadcastReadySegments },
    { getNextBroadcastSegmentsFromDb, getOncologyJournalsFromDb, getConferenceCoverageSlotsFromDb, getMedicalConferencesFromDb },
    { buildBroadcastSlots },
    { buildBroadcastMetadata }
  ] = await Promise.all([
    import("@/lib/data"),
    import("@/lib/db"),
    import("@/lib/rundown/slots"),
    import("@/lib/youtube/broadcastMetadata")
  ]);

  const hourStart = parseStart();
  const [rawApproved, journals, coverageSlots, conferences] = await Promise.all([
    getNextBroadcastSegmentsFromDb(120),
    getOncologyJournalsFromDb(),
    getConferenceCoverageSlotsFromDb(),
    getMedicalConferencesFromDb()
  ]);
  const approved = filterBroadcastReadySegments(rawApproved ?? []);
  const slots = buildBroadcastSlots({
    segments: approved,
    scheduleSegments: [],
    baseTime: hourStart,
    hours: 1
  });
  const journalsById = new Map((journals ?? []).map((journal) => [journal.id, journal]));
  const activeSlot = (coverageSlots ?? []).find((slot) => slot.id === process.env.COVERAGE_SLOT_ID);
  const activeConference = activeSlot
    ? (conferences ?? []).find((conference) => conference.id === activeSlot.conferenceId)
    : undefined;

  const metadata = buildBroadcastMetadata({
    hourStart,
    conferenceName: activeConference?.acronym ?? activeConference?.name,
    slots,
    journalsById
  });

  const contentSlots = slots.filter((slot) => Boolean(slot.segment));
  const cardsWithJournalData = contentSlots.filter(
    (slot) => slot.segment?.citations?.[0]?.journalId && journalsById.has(slot.segment.citations[0].journalId)
  ).length;
  const tagsTotalChars = metadata.tags.reduce((sum, tag) => sum + tag.length + 3, 0);

  console.log(
    JSON.stringify(
      {
        hourStart: hourStart.toISOString(),
        tier: metadata.tier,
        journalName: metadata.journalName,
        specialty: metadata.specialty,
        title: metadata.title,
        titleLength: metadata.title.length,
        description: metadata.description,
        tags: metadata.tags,
        tagsTotalChars,
        categoryId: metadata.categoryId,
        contentCardCount: contentSlots.length,
        cardsWithJournalData
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
