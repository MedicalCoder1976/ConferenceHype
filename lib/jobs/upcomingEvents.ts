import { randomUUID } from "node:crypto";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { sourceRegistry } from "@/lib/sources/registry";
import type { Segment } from "@/lib/types";

export function buildScheduleFallbackSegment(now = new Date()): Segment {
  const officialSources = sourceRegistry
    .filter((source) => source.enabled && source.type === "official")
    .slice(0, 4);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(now);
  const sourceNames = officialSources.map((source) => source.name).join(", ");

  return {
    id: `schedule-spine-${randomUUID()}`,
    title: "Official meeting schedule check",
    summary:
      "Source-only schedule and logistics check using the configured official meeting sources.",
    script: [
      `Two-minute schedule check. It is ${timeLabel} Eastern time.`,
      sourceNames
        ? `The official source desk is monitoring ${sourceNames}.`
        : "No official schedule update is ready for this window.",
      "Use the official meeting program and on-site signage for room, hall, and timing changes.",
      "ConferenceHype will continue with the next source-attributed update."
    ].join("\n\n"),
    contentType: "agenda_preview",
    personaId: "echo-sage",
    personaName: "Echo Sage",
    hypeLevel: "standard",
    language: "English",
    status: "approved",
    citations: officialSources.map((source) => ({
      label: source.name,
      url: source.url,
      sourceType: source.type
    })),
    socialBuzzItems: [],
    riskFlags: ["no_llm_schedule_spine", "official_schedule_only"],
    confidenceScore: officialSources.length ? 92 : 75,
    createdAt: now.toISOString()
  };
}

export function buildScheduleRundownSegments(now = new Date(), hours = 1) {
  const totalMinutes = hours * 60;
  return Array.from({ length: totalMinutes / 20 }, (_, index) => {
    const scheduledAt = new Date(now.getTime() + index * 20 * 60 * 1000);
    const segment = buildScheduleFallbackSegment(scheduledAt);
    return {
      ...segment,
      id: `virtual-${segment.id}`,
      title: `Official schedule check: ${new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short"
      }).format(scheduledAt)}`,
      approvedAt: scheduledAt.toISOString(),
      updatedAt: scheduledAt.toISOString(),
      riskFlags: [...segment.riskFlags, "virtual_admin_rundown"]
    };
  });
}

export async function runUpcomingEventsJob(now = new Date()) {
  const segment = buildScheduleFallbackSegment(now);
  await saveGeneratedSegmentsToDb([segment]);
  return [segment];
}
