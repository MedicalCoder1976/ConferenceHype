import fs from "node:fs";
import path from "node:path";
import type { IngestedItem } from "@/lib/types";

type CoreSession = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  title: string;
  sessionType: string;
  location: string;
  track: string;
  topics: string;
  overview: string;
  sourceName: string;
  sourceUrl: string;
};

type CoreAbstract = {
  id: string;
  abstractNumber: string;
  presentationStartAt: string | null;
  presentationEndAt: string | null;
  speaker: string;
  sessionTitle: string;
  sessionType: string;
  presentationTitle: string;
  track: string;
  abstractStatus: string;
  abstractBodyPreview: string;
  sourceName: string;
  sourceUrl: string;
};

type CoreIndex = {
  costPolicy: {
    lookbackMinutes: number;
    lookaheadMinutes: number;
    maxBriefingSources: number;
    maxAbstractSourcesPerBriefing: number;
    maxBackgroundSources: number;
  };
  sessions: CoreSession[];
  abstracts: CoreAbstract[];
};

let cachedIndex: CoreIndex | null = null;

function loadCoreIndex() {
  if (cachedIndex) {
    return cachedIndex;
  }
  const filePath = path.join(process.cwd(), "data", "asco2026", "core-index.json");
  cachedIndex = JSON.parse(fs.readFileSync(filePath, "utf8")) as CoreIndex;
  return cachedIndex;
}

function toMillis(value: string | null) {
  if (!value) {
    return null;
  }
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function minutes(ms: number) {
  return ms * 60 * 1000;
}

function includesText(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function sessionToItem(session: CoreSession, label: "recent" | "upcoming"): IngestedItem {
  const timeLabel =
    label === "recent"
      ? `Recently wrapped: ${session.endAt ?? "time pending"}`
      : `Coming up: ${session.startAt ?? "time pending"}`;
  return {
    id: `${session.id}-${label}`,
    title: `${timeLabel} - ${session.title}`,
    url: session.sourceUrl,
    excerpt: [
      `Type: ${session.sessionType}`,
      `Track: ${session.track}`,
      `Location: ${session.location}`,
      session.topics ? `Topics: ${session.topics}` : "",
      session.overview ? `Overview: ${session.overview}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    sourceName: session.sourceName,
    sourceType: "official",
    rank: 1,
    publishedAt: label === "recent" ? session.endAt ?? undefined : session.startAt ?? undefined
  };
}

function abstractToItem(abstract: CoreAbstract, rank: number): IngestedItem {
  return {
    id: abstract.id,
    title: `Abstract ${abstract.abstractNumber}: ${abstract.presentationTitle}`,
    url: abstract.sourceUrl,
    excerpt: [
      `Track: ${abstract.track}`,
      `Session: ${abstract.sessionTitle}`,
      `Type: ${abstract.sessionType}`,
      abstract.speaker ? `Presenter: ${abstract.speaker}` : "",
      `Status: ${abstract.abstractStatus}`,
      abstract.abstractBodyPreview
    ]
      .filter(Boolean)
      .join("\n"),
    sourceName: abstract.sourceName,
    sourceType: "official",
    rank,
    author: abstract.speaker,
    publishedAt: abstract.presentationStartAt ?? undefined
  };
}

export function getAscoBriefingSources(now = new Date()): IngestedItem[] {
  const index = loadCoreIndex();
  const nowMs = now.getTime();
  const lookbackStart = nowMs - minutes(index.costPolicy.lookbackMinutes);
  const lookaheadEnd = nowMs + minutes(index.costPolicy.lookaheadMinutes);

  const recentSessions = index.sessions
    .filter((session) => {
      const endMs = toMillis(session.endAt);
      return endMs !== null && endMs >= lookbackStart && endMs <= nowMs;
    })
    .sort((a, b) => (toMillis(b.endAt) ?? 0) - (toMillis(a.endAt) ?? 0));

  const upcomingSessions = index.sessions
    .filter((session) => {
      const startMs = toMillis(session.startAt);
      return startMs !== null && startMs > nowMs && startMs <= lookaheadEnd;
    })
    .sort((a, b) => (toMillis(a.startAt) ?? 0) - (toMillis(b.startAt) ?? 0));

  const sessionItems = [
    ...recentSessions.slice(0, 4).map((session) => sessionToItem(session, "recent")),
    ...upcomingSessions.slice(0, 6).map((session) => sessionToItem(session, "upcoming"))
  ];

  const activeTracks = new Set(
    [...recentSessions, ...upcomingSessions]
      .map((session) => session.track)
      .filter(Boolean)
  );
  const abstractItems = index.abstracts
    .filter((abstract) => {
      const startMs = toMillis(abstract.presentationStartAt);
      const timedInWindow = startMs !== null && startMs >= lookbackStart && startMs <= lookaheadEnd;
      const trackMatch = [...activeTracks].some((track) => includesText(abstract.track, track));
      return timedInWindow || trackMatch;
    })
    .slice(0, index.costPolicy.maxAbstractSourcesPerBriefing)
    .map((abstract) => abstractToItem(abstract, 2));

  return [...sessionItems, ...abstractItems].slice(0, index.costPolicy.maxBriefingSources);
}

export function getAscoBackgroundSources(limit = 8): IngestedItem[] {
  const index = loadCoreIndex();
  const max = Math.min(limit, index.costPolicy.maxBackgroundSources);
  return index.abstracts
    .filter((abstract) => abstract.abstractStatus !== "embargoed_or_pending")
    .slice(0, max)
    .map((abstract) => abstractToItem(abstract, 2));
}

export function getAscoCoreStats() {
  const index = loadCoreIndex();
  return {
    sessions: index.sessions.length,
    abstracts: index.abstracts.length,
    lookbackMinutes: index.costPolicy.lookbackMinutes,
    lookaheadMinutes: index.costPolicy.lookaheadMinutes
  };
}
