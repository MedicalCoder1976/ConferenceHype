import { randomUUID } from "node:crypto";
import { getAscoCoreStats, getAscoUpcomingEventSources } from "@/lib/asco2026/core";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { withSpokenDisclaimer } from "@/lib/generation/disclaimers";
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

  const script = withSpokenDisclaimer(
    [
      `ASCO Hype is live on the conference dial. It is ${timeLabel} Chicago time, and this is your high-energy schedule hit from the no-token ASCO 2026 program spine.`,
      "Keep it locked: we are moving fast, staying source-forward, and treating every hot take as buzz until it clears review.",
      `Looking ahead over the next ${stats.scheduleSpineLookaheadMinutes} minutes:`,
      ...sessionLines,
      posterSources.length
        ? `Poster wall callout, W-poster watch, and Hall A energy check: ${posterSources.map(compactLine).join(" ")} Repeat the room before you move, and verify poster locations in the ASCO app and on-site signage because locations can change unexpectedly.`
        : "Poster wall callout: when Hall A Posters and Exhibits heats up, we will flag the poster-watch blocks here. If you are walking the W posters or poster wall, tag #ASCOHype with what deserves a look.",
      abstractLines.length
        ? `Related abstract context on the desk: ${abstractLines.join(" ")}`
        : "No extra abstract context is being added to this window.",
      "Media monitor: we are also listening for reviewed broadcast and media signals from OncLive, STAT News, The ASCO Post, X posts, and operator-approved conference-floor reports.",
      "Audience check-in: if you find genuinely good snacks or coffee in the Exhibitor Hall, post it on X with #ASCOHype so the desk can see it. We will treat those posts as audience tips, not endorsements, and operators can review the best ones for broadcast.",
      "Between these schedule checks, the channel can be interrupted by audience posts, #ASCOHype tags, X posts, Instagram-style social signals, OncLive, STAT News, The ASCO Post, exhibitor updates, snack and coffee recommendations from the Exhibitor Hall, or operator-injected topics when those items clear review."
    ].join("\n\n")
  );

  return {
    id: `schedule-spine-${randomUUID()}`,
    title: `Next ${stats.scheduleSpineLookaheadMinutes} minutes at ASCO`,
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

export async function runUpcomingEventsJob(now = new Date()) {
  const sources = getAscoUpcomingEventSources(now);
  const segment = buildNoTokenUpcomingSegment(sources, now);
  await saveGeneratedSegmentsToDb([segment]);
  return [segment];
}
