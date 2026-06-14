import { randomUUID } from "node:crypto";
import { getAscoCoreStats, getAscoUpcomingEventSources } from "@/lib/asco2026/core";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import type { Citation, IngestedItem, Segment } from "@/lib/types";

function uniqueCitations(sources: IngestedItem[]): Citation[] {
  const seen = new Set<string>();
  return sources
    .filter((source) => {
      const key = `${source.sourceName}|${source.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((source) => ({
      label: source.sourceName,
      url: source.url,
      sourceType: source.sourceType
    }));
}

function compactLine(source: IngestedItem) {
  const title = source.title.replace(/<[^>]+>/g, "");
  const details = source.excerpt
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .filter((line) => /^(Type|Track|Location|Session|Presenter|Status):/.test(line))
    .join("; ");
  return `${title}${details ? `. ${details}.` : "."}`;
}

function isPosterSource(source: IngestedItem) {
  return /poster/i.test(`${source.title} ${source.excerpt}`);
}

function buildNoTokenUpcomingSegment(sources: IngestedItem[], now: Date): Segment {
  const stats = getAscoCoreStats();
  const sessionSources = sources.filter((source) => source.id.includes("session"));
  const abstractSources = sources.filter((source) => source.id.includes("abstract"));
  const posterSources = sessionSources.filter(isPosterSource);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(now);

  const sessionLines = sessionSources.length
    ? sessionSources.map(compactLine)
    : [
        `No scheduled sessions were found in the next ${stats.scheduleSpineLookaheadMinutes} minutes from the current ASCO program index.`
      ];
  const abstractLines = abstractSources.map(compactLine);

  const script = [
    `Two-minute schedule check. It is ${timeLabel} Chicago time.`,
    `Next ${stats.scheduleSpineLookaheadMinutes} minutes: ${sessionLines.join(" ")}`,
    posterSources.length
      ? `Poster/location note: ${posterSources.map(compactLine).join(" ")} Check rooms and halls in the ASCO app and on-site signage.`
      : "Location note: no specific room or hall is listed in this window; check any movement in the ASCO app and on-site signage.",
    abstractLines.length
      ? `Related abstract pointer: ${abstractLines.join(" ")}`
      : "No extra abstract pointer in this schedule break."
  ].join("\n\n");

  return {
    id: `schedule-spine-${randomUUID()}`,
    title: `Next 10 minutes at ASCO`,
    summary:
      "Prepared no-token upcoming-events schedule spine from the ASCO 2026 session and abstract index.",
    script,
    contentType: "agenda_preview",
    personaId: "echo-sage",
    personaName: "TumorCrusher",
    hypeLevel: "standard",
    language: "English",
    status: "approved",
    citations: uniqueCitations(sources),
    socialBuzzItems: [],
    riskFlags: ["no_llm_schedule_spine", "official_schedule_only"],
    confidenceScore: sessionSources.length ? 96 : 80,
    createdAt: now.toISOString()
  };
}

export function buildScheduleFallbackSegment(now = new Date()) {
  const sources = getAscoUpcomingEventSources(now, 10);
  return buildNoTokenUpcomingSegment(sources, now);
}

export function buildScheduleRundownSegments(now = new Date(), hours = 1) {
  const totalMinutes = hours * 60;
  return Array.from({ length: totalMinutes / 20 }, (_, index) => {
    const scheduledAt = new Date(now.getTime() + index * 20 * 60 * 1000);
    const segment = buildScheduleFallbackSegment(scheduledAt);
    return {
      ...segment,
      id: `virtual-${segment.id}`,
      title: `Schedule/location rundown: ${new Intl.DateTimeFormat("en-US", {
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
