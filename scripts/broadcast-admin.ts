// broadcast-admin.ts — operator tool for controlling the continuous broadcast
// flag and inspecting the weekly card pool. Dispatched via GitHub Actions.
//
// Actions:
//   disable-continuous  — sets stream_state.continuous_enabled = false
//   report-pool         — prints a structured card pool health report
//   disable-and-report  — both in sequence (default)
//   check-readiness     — checks whether the next scheduled broadcast hour
//                         has approved segments and an auto-trigger slot

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import {
  getStreamStateFromDb,
  updateContinuousBroadcastInDb,
  getConferenceCoverageSlotsFromDb,
  getPendingSegmentsFromDb,
  getNextBroadcastSegmentsFromDb,
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

async function checkReadiness() {
  // Check the next approved broadcast hour: is there a coverage slot that will
  // auto-trigger the cron, and do the scheduled segments all pass validation?
  const [streamState, slots, nextRaw] = await Promise.all([
    getStreamStateFromDb(),
    getConferenceCoverageSlotsFromDb(),
    getNextBroadcastSegmentsFromDb(200)
  ]);

  const targetEnv = process.env.BROADCAST_CHECK_TARGET;
  const now = new Date();

  // Find the next approved + not_scheduled slot in the future.
  const futureSlots = (slots ?? [])
    .filter((s) => s.approvalStatus === "approved" && s.youtubeStatus === "not_scheduled" && new Date(s.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const nextSlot = futureSlots[0];

  // If a specific target time is requested, also check that window.
  const targetTime = targetEnv ? new Date(targetEnv) : nextSlot ? new Date(nextSlot.startsAt) : undefined;

  console.log("=== BROADCAST READINESS CHECK ===");
  console.log(`Time now:            ${now.toISOString()}`);
  console.log(`continuous_enabled:  ${streamState?.continuousEnabled}`);

  if (!targetTime) {
    console.log("\n⚠  No target time and no approved future slots found.");
    console.log("   Use the admin UI to schedule a broadcast slot, or set BROADCAST_CHECK_TARGET.");
    return;
  }

  console.log(`Target slot:         ${targetTime.toISOString()}`);

  // Coverage slot check
  const matchingSlot = futureSlots.find((s) => {
    const diff = Math.abs(new Date(s.startsAt).getTime() - targetTime.getTime());
    return diff < 30 * 60 * 1000; // within 30 min
  });

  console.log("\n--- Coverage slot (auto-trigger) ---");
  if (matchingSlot) {
    console.log(`  ✓ Slot ${matchingSlot.id}`);
    console.log(`    starts_at:       ${matchingSlot.startsAt}`);
    console.log(`    approval_status: ${matchingSlot.approvalStatus}`);
    console.log(`    youtube_status:  ${matchingSlot.youtubeStatus}`);
    const cronTriggerTime = new Date(targetTime.getTime() - 45 * 60 * 1000);
    console.log(`    Cron fires at:   ${cronTriggerTime.toISOString()} (45 min before slot)`);
  } else {
    console.log("  ✗ No approved coverage slot near the target time");
    console.log("    → Admin must manually trigger: gh workflow run youtube-stream.yml \\");
    console.log(`      --field stream_start_time=${targetTime.toISOString()} \\`);
    console.log("      --field duration_minutes=60");
  }

  // Approved segments check
  const nextSegments = filterBroadcastReadySegments(nextRaw ?? []);
  const windowMs = 2 * 60 * 60 * 1000;
  const approvedSegments = nextSegments.filter((s) => {
    if (!s.approvedAt) return false;
    return Math.abs(new Date(s.approvedAt).getTime() - targetTime.getTime()) < windowMs;
  });

  console.log("\n--- Approved segments ---");
  if (approvedSegments.length === 0) {
    console.log("  ✗ No approved segments found for this time window");
    console.log("    → Use 'create 1 hour batch cards' in the admin UI for this slot");
  } else {
    let allValid = true;
    for (const s of approvedSegments) {
      const errors = validateSegmentForApproval(s);
      const approvedAt = s.approvedAt ? new Date(s.approvedAt).toISOString() : "?";
      const flag = errors.length === 0 ? "✓" : "✗";
      console.log(`  ${flag} [${approvedAt}] ${s.title.slice(0, 70)}`);
      if (errors.length > 0) {
        allValid = false;
        for (const e of errors) console.log(`      ERROR: ${e}`);
      }
    }
    console.log(`\n  ${allValid ? "✓" : "✗"} ${approvedSegments.length} segments — ${allValid ? "all valid" : "some have validation errors"}`);
  }

  console.log("\n=== SUMMARY ===");
  const ready = Boolean(matchingSlot) && approvedSegments.length > 0 &&
    approvedSegments.every((s) => validateSegmentForApproval(s).length === 0);

  if (ready) {
    console.log("✓ READY — no admin action needed. The broadcast will render and stream automatically.");
  } else {
    console.log("✗ NOT READY — see issues above.");
    process.exitCode = 1;
  }
}

async function main() {
  if (action === "disable-continuous" || action === "disable-and-report") {
    await disableContinuous();
  }
  if (action === "report-pool" || action === "disable-and-report") {
    await reportPool();
  }
  if (action === "check-readiness") {
    await checkReadiness();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
