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
    title: "ConferenceHype transition",
    summary:
      "Music transition while the next approved card is prepared.",
    script: [
      `ConferenceHype transition. It is ${timeLabel} Eastern time.`,
      sourceNames
        ? `The next approved card is coming up after the music.`
        : "The next approved card is coming up after the music.",
      "ConferenceHype will continue shortly."
    ].join("\n\n"),
    contentType: "media_roundup",
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
    riskFlags: ["no_llm_transition_spine"],
    confidenceScore: officialSources.length ? 92 : 75,
    createdAt: now.toISOString()
  };
}

export function buildScheduleRundownSegments(now = new Date(), hours = 1) {
  void now;
  void hours;
  return [];
}

export async function runUpcomingEventsJob(now = new Date()) {
  const segment = buildScheduleFallbackSegment(now);
  await saveGeneratedSegmentsToDb([segment]);
  return [segment];
}
