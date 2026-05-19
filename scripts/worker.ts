import { runGenerateJob } from "@/lib/jobs/generateSegments";
import { runBriefingJob } from "@/lib/jobs/briefing";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { logInfo } from "@/lib/logging";

async function main() {
  const command = process.argv[2];
  if (command === "ingest") {
    const items = await runIngestionJob();
    logInfo("worker ingestion finished", { count: items.length });
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (command === "generate") {
    const segments = await runGenerateJob();
    logInfo("worker generation finished", { count: segments.length });
    console.log(JSON.stringify(segments, null, 2));
    return;
  }
  if (command === "briefing") {
    const briefingNow = process.env.ASCO_BRIEFING_NOW
      ? new Date(process.env.ASCO_BRIEFING_NOW)
      : new Date();
    const segments = await runBriefingJob(briefingNow);
    logInfo("worker briefing finished", { count: segments.length });
    console.log(JSON.stringify(segments, null, 2));
    return;
  }
  throw new Error("Usage: tsx scripts/worker.ts ingest|generate|briefing");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
