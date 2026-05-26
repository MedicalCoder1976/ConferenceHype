import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  addMinutes,
  buildBroadcastHourBuckets,
  buildBroadcastSlots,
  type BroadcastSlot
} from "@/lib/rundown/slots";
import type { Segment } from "@/lib/types";

loadEnvConfig(process.cwd());

function easternDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function todayAtPlanningEastern(now = new Date()) {
  const { year, month, day } = easternDateParts(now);
  return new Date(`${year}-${month}-${day}T21:00:00-04:00`);
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

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(date);
}

function contentLabel(segment?: Segment) {
  if (!segment) {
    return "";
  }
  if (segment.contentType === "industry_floor") {
    return "exhibitor chatter";
  }
  if (segment.contentType === "abstract_buzz") {
    return "abstract chatter";
  }
  return segment.contentType.replace(/_/g, " ");
}

function renderPreview(slots: BroadcastSlot[], start: Date) {
  const end = addMinutes(start, 180);
  const lines = [
    `# ASCO Hype 21:00 Planning Slot Preview`,
    "",
    `Start: ${timeLabel(start)}`,
    `End: ${timeLabel(end)}`,
    "",
    "This preview includes two-minute schedule/location narration every 10 minutes, a two-minute hourly rising-social-voice rundown after the hourly schedule, review/ready voice cards filling the remaining slots, and music wherever no card is available.",
    ""
  ];

  for (const slot of slots) {
    lines.push(`## ${timeLabel(slot.at)} - ${slot.kind.toUpperCase()} (${slot.durationMinutes} min)`);
    if (slot.kind === "music") {
      lines.push("Music bed / transition space.");
      lines.push("");
      continue;
    }

    lines.push(`Voice: ${slot.segment?.personaName ?? "Schedule spine"}`);
    lines.push(`Type: ${contentLabel(slot.segment)}`);
    lines.push(`Title: ${slot.segment?.title ?? slot.label}`);
    lines.push("");
    lines.push(slot.segment?.script.trim() || slot.segment?.summary || slot.label);
    if (slot.segment?.citations.length) {
      lines.push("");
      lines.push("Sources:");
      for (const citation of slot.segment.citations) {
        lines.push(`- ${citation.label}${citation.url ? ` (${citation.url})` : ""}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [
    { filterBroadcastReadySegments },
    { getNextBroadcastSegmentsFromDb, getPendingSegmentsFromDb, getSocialVoiceLeaderboardFromDb },
    { buildScheduleRundownSegments },
    { buildHourlySocialVoiceRundownSegments }
  ] =
    await Promise.all([
      import("@/lib/data"),
      import("@/lib/db"),
      import("@/lib/jobs/upcomingEvents"),
      import("@/lib/social/hourlyVoiceRundown")
    ]);
  const start = parseStart();
  const rawApproved = (await getNextBroadcastSegmentsFromDb(120)) ?? [];
  const rawReview = (await getPendingSegmentsFromDb()) ?? [];
  const approved = filterBroadcastReadySegments(rawApproved);
  const review = filterBroadcastReadySegments(rawReview);
  const scheduleSegments = buildScheduleRundownSegments(start);
  const socialVoiceSegments = buildHourlySocialVoiceRundownSegments({
    leaders: (await getSocialVoiceLeaderboardFromDb()) ?? [],
    baseTime: start
  });
  const slots = buildBroadcastHourBuckets(
    buildBroadcastSlots({
      segments: approved,
      reviewSegments: review,
      scheduleSegments,
      socialVoiceSegments,
      baseTime: start
    }),
    start
  ).flatMap((bucket) => bucket.slots);
  const output = renderPreview(slots, start);
  const outputDir = path.join(process.cwd(), ".tmp");
  const outputPath = path.join(outputDir, "planning-slot-preview.md");
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, output, "utf8");
  console.log(
    JSON.stringify(
      {
        start: start.toISOString(),
        outputPath,
        slots: slots.length,
        rawApprovedCards: rawApproved.length,
        approvedBroadcastCards: approved.length,
        rawReviewCards: rawReview.length,
        reviewBroadcastCards: review.length,
        scheduleNarrations: slots.filter((slot) => slot.kind === "schedule").length,
        hourlySocialVoiceRundowns: slots.filter((slot) => slot.kind === "social").length,
        voiceCards: slots.filter((slot) => slot.kind === "statement").length,
        backupVoiceCards: slots.filter((slot) => slot.kind === "backup").length,
        musicBeds: slots.filter((slot) => slot.kind === "music").length
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
