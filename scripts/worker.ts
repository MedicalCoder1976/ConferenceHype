import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { logInfo } = await import("@/lib/logging");
  const command = process.argv[2];
  if (command === "ingest") {
    const { runIngestionJob } = await import("@/lib/jobs/ingest");
    const items = await runIngestionJob();
    logInfo("worker ingestion finished", { count: items.length });
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (command === "generate") {
    const { runGenerateJob } = await import("@/lib/jobs/generateSegments");
    const segments = await runGenerateJob();
    logInfo("worker generation finished", { count: segments.length });
    console.log(JSON.stringify(segments, null, 2));
    return;
  }
  if (command === "briefing") {
    const { runBriefingJob } = await import("@/lib/jobs/briefing");
    const briefingNow = process.env.CONFERENCE_BRIEFING_NOW
      ? new Date(process.env.CONFERENCE_BRIEFING_NOW)
      : new Date();
    const segments = await runBriefingJob(briefingNow);
    logInfo("worker briefing finished", { count: segments.length });
    console.log(JSON.stringify(segments, null, 2));
    return;
  }
  if (command === "upcoming") {
    const { runUpcomingEventsJob } = await import("@/lib/jobs/upcomingEvents");
    const upcomingNow = process.env.CONFERENCE_UPCOMING_NOW
      ? new Date(process.env.CONFERENCE_UPCOMING_NOW)
      : new Date();
    const segments = await runUpcomingEventsJob(upcomingNow);
    logInfo("worker upcoming events finished", { count: segments.length });
    console.log(JSON.stringify(segments, null, 2));
    return;
  }
  throw new Error("Usage: tsx scripts/worker.ts ingest|generate|briefing|upcoming");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
