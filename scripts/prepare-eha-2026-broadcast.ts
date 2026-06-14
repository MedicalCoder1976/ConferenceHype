import { loadEnvConfig } from "@next/env";
import type { IngestedItem } from "@/lib/types";

const conferenceStart =
  process.env.EHA_BROADCAST_START ?? "2026-06-12T08:00:00+02:00";
const coverageDays = Number(process.env.EHA_BROADCAST_DAYS ?? 4);

async function main() {
  loadEnvConfig(process.cwd());
  const [
    {
      getEditorialPackagesFromDb,
      getMedicalConferencesFromDb,
      getRecentIngestedItemsFromDb,
      markEditorialPackageScheduledInDb,
      replaceConferenceCoverageSlotsInDb,
      saveEditorialPackageToDb,
      saveGeneratedSegmentsToDb
    },
    {
      developMeetingWatchPackage,
      packageToScheduledSegments
    },
    { runIngestionJob },
    { fetchPageSummary }
  ] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/editorial/packages"),
    import("@/lib/jobs/ingest"),
    import("@/lib/sources/scraper")
  ]);

  const startsAt = new Date(conferenceStart);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error(`Invalid EHA_BROADCAST_START: ${conferenceStart}`);
  }
  if (!Number.isInteger(coverageDays) || coverageDays < 1 || coverageDays > 7) {
    throw new Error("EHA_BROADCAST_DAYS must be an integer from 1 to 7.");
  }

  await runIngestionJob();
  const conferences = await getMedicalConferencesFromDb();
  const conference = conferences?.find(
    (candidate) => candidate.acronym?.toUpperCase() === "EHA" && candidate.year === 2026
  );
  if (!conference) {
    throw new Error("EHA 2026 is not present in the medical conference catalog.");
  }

  const slotStarts = Array.from(
    { length: coverageDays * 24 },
    (_, index) => new Date(startsAt.getTime() + index * 60 * 60 * 1000).toISOString()
  );
  await replaceConferenceCoverageSlotsInDb({
    conferenceId: conference.id,
    startsAt: slotStarts
  });

  const editionDate = startsAt.toLocaleDateString("en-CA", {
    timeZone: conference.timezone
  });
  const editionKey = `${conference.id}:${editionDate}`;
  const packages = await getEditorialPackagesFromDb();
  let editorialPackage = packages?.find(
    (candidate) =>
      candidate.category === "meeting_watch" &&
      candidate.editionKey === editionKey
  );

  if (!editorialPackage) {
    const [official] = await fetchPageSummary({
      id: conference.id,
      name: conference.name,
      url: conference.officialUrl,
      type: "official",
      rank: 1,
      enabled: true
    });
    const recent = (await getRecentIngestedItemsFromDb(24 * 30, 240)) ?? [];
    const terms = [conference.name, conference.acronym]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());
    const relevant = recent.filter((item) =>
      terms.some((term) =>
        `${item.title} ${item.excerpt} ${item.sourceName}`.toLowerCase().includes(term)
      )
    );
    const sources: IngestedItem[] = [official, ...relevant].filter(Boolean).slice(0, 80);
    const developed = await developMeetingWatchPackage(
      conference,
      sources,
      editionDate
    );
    editorialPackage = await saveEditorialPackageToDb(developed) ?? undefined;
  }

  if (!editorialPackage) {
    throw new Error("EHA Meeting Watch package could not be saved.");
  }

  let segmentCount = 0;
  if (editorialPackage.status !== "scheduled") {
    const segments = packageToScheduledSegments(editorialPackage, startsAt);
    const saved = await saveGeneratedSegmentsToDb(segments);
    segmentCount = saved?.length ?? 0;
    editorialPackage =
      await markEditorialPackageScheduledInDb(
        editorialPackage.id,
        startsAt.toISOString()
      ) ?? editorialPackage;
  }

  console.log(JSON.stringify({
    conference: conference.name,
    timezone: conference.timezone,
    coverageStart: slotStarts[0],
    coverageEnd: new Date(
      new Date(slotStarts.at(-1)!).getTime() + 60 * 60 * 1000
    ).toISOString(),
    coverageSlots: slotStarts.length,
    packageId: editorialPackage.id,
    packageStatus: editorialPackage.status,
    segmentCount
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
