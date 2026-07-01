// broadcast-admin.ts — operator tool for controlling the continuous broadcast
// flag and inspecting the weekly card pool. Dispatched via GitHub Actions.
//
// Actions:
//   disable-continuous  — sets stream_state.continuous_enabled = false
//   report-pool         — prints a structured card pool health report
//   disable-and-report  — both in sequence (default)

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import {
  getStreamStateFromDb,
  updateContinuousBroadcastInDb,
  getConferenceCoverageSlotsFromDb,
  getPendingSegmentsFromDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getSourcesFromDb,
  upsertAdminCatalogSeedsToDb
} from "@/lib/db";
import { filterBroadcastReadySegments } from "@/lib/data";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import {
  sortWeeklyReadySegmentsForSelection,
  weeklySourceWeekKey,
  sourceIdMatchesConference,
  sourceIdMatchesJournal,
  WEEKLY_SOURCE_POOL_FLAG
} from "@/lib/weeklySourceCards";
import { sourceRegistry } from "@/lib/sources/registry";

const action = process.env.BROADCAST_ADMIN_ACTION ?? "disable-and-report";

async function disableContinuous() {
  const before = await getStreamStateFromDb();
  console.log(`[disable-continuous] continuous_enabled was: ${before?.continuousEnabled}`);
  await updateContinuousBroadcastInDb(false);
  const after = await getStreamStateFromDb();
  console.log(`[disable-continuous] continuous_enabled is now: ${after?.continuousEnabled}`);
}

async function reportPool() {
  await upsertAdminCatalogSeedsToDb();
  const [pendingRaw, conferences, journals, sources, slots] = await Promise.all([
    getPendingSegmentsFromDb(2000),
    getMedicalConferencesFromDb(),
    getOncologyJournalsFromDb(),
    getSourcesFromDb(),
    getConferenceCoverageSlotsFromDb()
  ]);

  const weekKey = weeklySourceWeekKey();
  const allSources = sources ?? sourceRegistry;
  const pendingSegments = filterBroadcastReadySegments(pendingRaw ?? []);

  const weeklyPool = pendingSegments.filter((s) => s.riskFlags.includes(WEEKLY_SOURCE_POOL_FLAG));
  const schedulable = weeklyPool.filter((s) => validateSegmentForApproval(s).length === 0);

  const now = new Date().toISOString();
  const approvedSlots = (slots ?? []).filter(
    (s) =>
      s.approvalStatus === "approved" &&
      s.youtubeStatus === "not_scheduled" &&
      s.startsAt > now
  );

  console.log("\n=== AUTOMATION GATES ===");
  const streamState = await getStreamStateFromDb();
  console.log(`continuous_enabled: ${streamState?.continuousEnabled}`);
  console.log(`Approved pending slots: ${approvedSlots.length}`);
  for (const slot of approvedSlots) {
    console.log(`  • slot ${slot.id} starts_at=${slot.startsAt}`);
  }

  console.log(`\n=== CARD POOL — ${weekKey} ===`);
  console.log(`Broadcast-ready pending: ${pendingSegments.length}`);
  console.log(`Weekly pool cards:       ${weeklyPool.length}`);
  console.log(`Schedulable (validated): ${schedulable.length}`);

  const enabledConferences = (conferences ?? []).filter((c) => c.enabled);
  const enabledJournals = (journals ?? []).filter((j) => j.enabled);
  // Mirror verify-weekly-source-cards.ts: exclude general_social (X follow
  // voices) — those are individual social handles, not news sources, and they
  // don't get weekly pool cards by design.
  const enabledSources = allSources.filter(
    (s) => s.enabled && s.type !== "manual" && s.type !== "general_social"
  );

  const missingConferences: string[] = [];
  const missingJournals: string[] = [];
  const missingSources: string[] = [];

  console.log("\n--- Conferences ---");
  for (const conf of enabledConferences) {
    const confCards = schedulable.filter((s) =>
      s.riskFlags.some((f) => f.startsWith("source_id:") && sourceIdMatchesConference(f.slice("source_id:".length), conf))
    );
    const status = confCards.length > 0 ? "✓" : "✗ MISSING";
    console.log(`  ${status}  ${conf.acronym ?? conf.name}: ${confCards.length} schedulable weekly cards`);
    if (confCards.length === 0) missingConferences.push(conf.name);
  }

  console.log("\n--- Journals ---");
  for (const journal of enabledJournals) {
    const jCards = schedulable.filter((s) =>
      s.riskFlags.some((f) => f.startsWith("source_id:") && sourceIdMatchesJournal(f.slice("source_id:".length), journal))
    );
    const status = jCards.length > 0 ? "✓" : "✗ MISSING";
    console.log(`  ${status}  ${journal.abbreviation ?? journal.name}: ${jCards.length} schedulable weekly cards`);
    if (jCards.length === 0) missingJournals.push(journal.name);
  }

  console.log("\n--- Newspapers ---");
  for (const source of enabledSources) {
    const sCards = schedulable.filter((s) => s.riskFlags.includes(`source_id:${source.id}`));
    if (sCards.length > 0) {
      console.log(`  ✓  ${source.name}: ${sCards.length} schedulable weekly cards`);
    }
  }
  const sourcesWithCards = enabledSources.filter((s) =>
    schedulable.some((seg) => seg.riskFlags.includes(`source_id:${s.id}`))
  );
  const sourcesWithout = enabledSources.filter((s) =>
    !schedulable.some((seg) => seg.riskFlags.includes(`source_id:${s.id}`))
  );
  if (sourcesWithout.length > 0) {
    for (const s of sourcesWithout) {
      console.log(`  ✗  ${s.name}: 0 schedulable weekly cards`);
      missingSources.push(s.name);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Conferences with 0 cards: ${missingConferences.length}`);
  console.log(`Journals with 0 cards:    ${missingJournals.length}`);
  console.log(`Sources with 0 cards:     ${missingSources.length}`);

  if (missingConferences.length + missingJournals.length + missingSources.length > 0) {
    console.log("\n⚠ Run the weekly-source-cards workflow to regenerate missing cards.");
    process.exitCode = 1;
  } else {
    console.log("\n✓ All sections have at least one schedulable card.");
  }
}

async function main() {
  if (action === "disable-continuous" || action === "disable-and-report") {
    await disableContinuous();
  }
  if (action === "report-pool" || action === "disable-and-report") {
    await reportPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
