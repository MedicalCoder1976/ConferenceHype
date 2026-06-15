import fs from "node:fs";
import path from "node:path";

type CoreSession = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  title: string;
  sessionType: string;
  location: string;
  track: string;
  topics?: string;
  overview?: string;
};

type CoreAbstract = {
  id: string;
  abstractNumber: string;
  presentationStartAt: string | null;
  presentationEndAt?: string | null;
  sessionTitle: string;
  presentationTitle: string;
  track: string;
  sessionType: string;
  speaker?: string;
  abstractStatus: string;
  abstractBodyPreview: string;
};

type CoreIndex = {
  sessions: CoreSession[];
  abstracts: CoreAbstract[];
};

type DayNarrative = {
  date: string;
  label: string;
  headline: string;
  oneLine: string;
  broadcastArc: string[];
  watchTracks: { track: string; sessionCount: number; abstractCount: number }[];
  plenarySessions: CoreSession[];
  tentpoleSessions: CoreSession[];
  posterSessions: CoreSession[];
  oralAbstracts: CoreAbstract[];
  abstractSignals: CoreAbstract[];
  audiencePrompts: string[];
  hostOpen: string;
  hostClose: string;
};

const DISCLAIMER =
  "ConferenceHype is AI-generated conference commentary for informational and entertainment purposes only. It is not medical, clinical, scientific, legal, or financial advice. Always consult qualified professionals and primary sources.";

const LOCATION_CHECK =
  "please check the room in the ASCO app and on-site signage, because meeting locations can change unexpectedly";

const EXHIBITOR_HALL_PROMPT =
  "Source check: tag #ConferenceHype or @ConferenceHype on X with source-attributed articles, official schedule items, media links, or monitored X voice callouts for operator review.";

const WORKOUT_PROMPT =
  "End-of-day movement check: invite listeners to tag @ConferenceHype with their conference steps, walks, runs, gym sessions, and other workouts. Treat these as audience shoutout candidates for the end-of-day broadcast after operator review, not fitness or medical advice.";

const MEDIA_MONITOR_PROMPT =
  "Media monitor callout: keep an ear on reviewed signals from OncLive, STAT News, The ASCO Post, X posts, and other operator-approved broadcast sources. Label media chatter as reported or discussed, not confirmed science unless primary sources support it.";

const POSTER_WALL_PROMPT =
  "Poster wall callout, W-poster watch: Hall A - Posters and Exhibits is the floor to watch. If a poster wall stop is busy, say the hall twice, ask listeners to check the location in the ASCO app and on-site signage, and invite #ConferenceHype posts from attendees on the ground.";

const DAY_LABELS: Record<string, string> = {
  "2026-05-29": "Friday, May 29",
  "2026-05-30": "Saturday, May 30",
  "2026-05-31": "Sunday, May 31",
  "2026-06-01": "Monday, June 1",
  "2026-06-02": "Tuesday, June 2"
};

const TRACK_FAMILIES = [
  {
    label: "lung cancer",
    match: ["Lung Cancer"],
    frame:
      "thoracic oncology sets up the high-attention evidence stream, with metastatic non-small cell disease and local-regional or small-cell sessions giving the channel a recurring clinical-science storyline"
  },
  {
    label: "breast cancer",
    match: ["Breast Cancer"],
    frame:
      "breast cancer anchors patient-centered treatment sequencing, adjuvant strategy, metastatic decision-making, and antibody-drug-conjugate watch points"
  },
  {
    label: "GI cancers",
    match: ["Gastrointestinal Cancer"],
    frame:
      "GI oncology supplies a dense cross-section of colorectal, gastroesophageal, pancreatic, hepatobiliary, and anal-cancer discussion"
  },
  {
    label: "developmental therapeutics",
    match: ["Developmental Therapeutics"],
    frame:
      "developmental therapeutics keeps the discovery lane active, especially targeted therapy, immunotherapy, tumor biology, and early-phase strategy"
  },
  {
    label: "GU cancers",
    match: ["Genitourinary Cancer"],
    frame:
      "GU oncology adds prostate, kidney, bladder, testicular, and penile-cancer signal for drug sequencing and biomarker interpretation"
  },
  {
    label: "quality and delivery",
    match: ["Quality Care", "Care Delivery", "Health Services"],
    frame:
      "quality, access, delivery, and health-services research keep the broadcast honest about how evidence reaches real patients"
  },
  {
    label: "symptom and supportive care",
    match: ["Symptom Science", "Palliative Care"],
    frame:
      "symptom science and palliative care add the practical lived-experience layer around toxicity, supportive care, and decision-making"
  },
  {
    label: "hematologic malignancies",
    match: ["Hematologic Malignancies"],
    frame:
      "hematologic malignancies provide lymphoma, leukemia, myeloma, transplant, and cellular-therapy threads"
  }
];

function cleanText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#8217;/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/Îº/g, "kappa")
    .replace(/Î±/g, "alpha")
    .replace(/Î²/g, "beta")
    .replace(/Î³/g, "gamma")
    .replace(/\s+/g, " ")
    .trim();
}

function comparisonText(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readIndex() {
  const filePath = path.join(process.cwd(), "data", "asco2026", "core-index.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CoreIndex;
}

function dateKey(value: string | null) {
  return value ? value.slice(0, 10) : "no-date";
}

function timeLabel(value: string | null) {
  if (!value) {
    return "time pending";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));
}

function millis(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTrack(track: string) {
  return track.trim() || "General program";
}

function countByTrack<T>(items: T[], getTrack: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const track = normalizeTrack(getTrack(item));
    counts.set(track, (counts.get(track) ?? 0) + 1);
  }
  return counts;
}

function topEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function trackMatches(track: string, candidate: string) {
  const left = track.toLowerCase();
  const right = candidate.toLowerCase();
  return left.includes(right) || right.includes(left);
}

function sessionMatchesAbstract(session: CoreSession, abstract: CoreAbstract) {
  if (dateKey(session.startAt) !== dateKey(abstract.presentationStartAt)) {
    return false;
  }

  const sessionStart = millis(session.startAt);
  const sessionEnd = millis(session.endAt);
  const abstractStart = millis(abstract.presentationStartAt);
  const abstractEnd = millis(abstract.presentationEndAt);
  const timeMatches =
    sessionStart === null ||
    sessionEnd === null ||
    abstractStart === null ||
    (abstractStart >= sessionStart && abstractStart <= sessionEnd) ||
    (abstractEnd !== null && abstractEnd >= sessionStart && abstractEnd <= sessionEnd);

  if (!timeMatches) {
    return false;
  }

  const sessionType = comparisonText(session.sessionType);
  const abstractType = comparisonText(abstract.sessionType);
  const typeMatches = sessionType === abstractType || sessionType.includes(abstractType) || abstractType.includes(sessionType);

  const sessionTitle = comparisonText(session.title);
  const abstractSessionTitle = comparisonText(abstract.sessionTitle);
  const sessionTrack = comparisonText(session.track);
  const abstractTrack = comparisonText(abstract.track);
  const titleOrTrackMatches =
    sessionTitle === abstractSessionTitle ||
    sessionTitle.includes(abstractSessionTitle) ||
    abstractSessionTitle.includes(sessionTitle) ||
    sessionTrack === abstractTrack ||
    sessionTrack.includes(abstractTrack) ||
    abstractTrack.includes(sessionTrack);

  return typeMatches && titleOrTrackMatches;
}

function findSessionForAbstract(abstract: CoreAbstract, sessions: CoreSession[]) {
  const candidates = sessions.filter((session) => sessionMatchesAbstract(session, abstract));
  if (candidates.length === 0) {
    return null;
  }

  const abstractStart = millis(abstract.presentationStartAt) ?? 0;
  return candidates.sort((a, b) => {
    const titleA = comparisonText(a.title) === comparisonText(abstract.sessionTitle) ? 1 : 0;
    const titleB = comparisonText(b.title) === comparisonText(abstract.sessionTitle) ? 1 : 0;
    if (titleA !== titleB) {
      return titleB - titleA;
    }
    const startA = millis(a.startAt) ?? abstractStart;
    const startB = millis(b.startAt) ?? abstractStart;
    return Math.abs(startA - abstractStart) - Math.abs(startB - abstractStart);
  })[0];
}

function locationLabel(value: string | undefined | null) {
  const cleaned = cleanText(value ?? "");
  return cleaned ? cleaned : "room pending";
}

function mccormickPlaceBuilding(location: string | undefined | null) {
  const cleaned = locationLabel(location);
  const lower = cleaned.toLowerCase();
  if (lower.includes("arie crown") || lower.startsWith("e") || lower.startsWith("hall d")) {
    return "McCormick Place Lakeside Center";
  }
  if (lower.startsWith("s")) {
    return "McCormick Place South Building";
  }
  if (lower.startsWith("n") || lower.startsWith("hall b")) {
    return "McCormick Place North Building";
  }
  if (lower.startsWith("w")) {
    return "McCormick Place West Building";
  }
  return "McCormick Place";
}

function spokenLocation(location: string | undefined | null) {
  const room = locationLabel(location);
  const building = mccormickPlaceBuilding(location);
  const place = room.toLowerCase().includes("arie crown") ? `${building}, ${room}` : `${building}, room ${room}`;
  return `location ${place}; repeat, ${place}; ${LOCATION_CHECK}`;
}

function formatAbstractLine(abstract: CoreAbstract, sessions: CoreSession[]) {
  const when = abstract.presentationStartAt ? `${timeLabel(abstract.presentationStartAt)} CT` : "time pending";
  const session = findSessionForAbstract(abstract, sessions);
  const sessionTitle = cleanText(session?.title ?? abstract.sessionTitle);
  const track = cleanText(abstract.track);
  const trackPrefix = comparisonText(sessionTitle) === comparisonText(track) ? track : `${track}; session ${sessionTitle}`;
  const block = session
    ? `${trackPrefix}; ${cleanText(session.sessionType)}; ${spokenLocation(session.location)}`
    : `${trackPrefix}; ${cleanText(abstract.sessionType)}; ${spokenLocation(null)}`;

  return `- ${when}: Abstract ${abstract.abstractNumber}, ${cleanText(abstract.presentationTitle)} (${block}${abstract.speaker ? `; ${cleanText(abstract.speaker)}` : ""})`;
}

function formatSessionLine(session: CoreSession) {
  return `- ${timeLabel(session.startAt)}-${timeLabel(session.endAt)} CT: ${cleanText(session.title)} (${cleanText(session.sessionType)}; ${cleanText(session.track)}; ${spokenLocation(session.location)})`;
}

function buildDayWatchTracks(
  daySessions: CoreSession[],
  allAbstracts: CoreAbstract[]
) {
  const sessionCounts = countByTrack(daySessions, (session) => session.track);
  const abstractCounts = countByTrack(allAbstracts, (abstract) => abstract.track);
  const sessionImportance = new Map<string, number>();
  for (const session of daySessions) {
    const track = normalizeTrack(session.track);
    sessionImportance.set(track, (sessionImportance.get(track) ?? 0) + scoreSession(session));
  }

  return [...sessionCounts.entries()]
    .map(([track, sessionCount]) => {
      const abstractCount = [...abstractCounts.entries()]
        .filter(([abstractTrack]) => trackMatches(track, abstractTrack))
        .reduce((sum, [, count]) => sum + count, 0);
      const score = (sessionImportance.get(track) ?? 0) * 6 + sessionCount * 20 + Math.min(abstractCount, 750) / 6;
      return { track, sessionCount, abstractCount, score };
    })
    .sort((a, b) => b.score - a.score || b.abstractCount - a.abstractCount || a.track.localeCompare(b.track))
    .slice(0, 8)
    .map(({ track, sessionCount, abstractCount }) => ({ track, sessionCount, abstractCount }));
}

function scoreSession(session: CoreSession) {
  const title = `${session.title} ${session.sessionType} ${session.track}`.toLowerCase();
  let score = 0;
  if (title.includes("plenary")) score += 20;
  if (title.includes("oral abstract")) score += 16;
  if (title.includes("rapid oral")) score += 12;
  if (title.includes("state of the art")) score += 10;
  if (title.includes("clinical science symposium")) score += 10;
  if (title.includes("special")) score += 8;
  if (title.includes("education")) score += 4;
  if (session.overview) score += 2;
  if (session.topics) score += 2;
  return score;
}

function selectTentpoles(daySessions: CoreSession[]) {
  return [...daySessions]
    .filter((session) => !isPlenarySession(session))
    .sort((a, b) => scoreSession(b) - scoreSession(a) || (a.startAt ?? "").localeCompare(b.startAt ?? ""))
    .slice(0, 10);
}

function isPosterSession(session: CoreSession) {
  return /poster/i.test(`${session.title} ${session.sessionType} ${session.location}`);
}

function isPlenarySession(session: CoreSession) {
  return /plenary/i.test(`${session.title} ${session.sessionType}`);
}

function isOralAbstract(abstract: CoreAbstract) {
  return /oral abstract/i.test(abstract.sessionType);
}

function selectPlenarySessions(daySessions: CoreSession[]) {
  return daySessions.filter(isPlenarySession);
}

function selectPosterSessions(daySessions: CoreSession[]) {
  return daySessions
    .filter(isPosterSession)
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? "") || a.track.localeCompare(b.track));
}

function selectOralAbstracts(date: string, allAbstracts: CoreAbstract[]) {
  return allAbstracts
    .filter((abstract) => dateKey(abstract.presentationStartAt) === date && isOralAbstract(abstract))
    .sort((a, b) => {
      const timeCompare = (a.presentationStartAt ?? "").localeCompare(b.presentationStartAt ?? "");
      if (timeCompare !== 0) {
        return timeCompare;
      }
      return a.abstractNumber.localeCompare(b.abstractNumber);
    });
}

function selectAbstractSignals(
  date: string,
  watchTracks: { track: string }[],
  allAbstracts: CoreAbstract[]
) {
  const timed = allAbstracts.filter((abstract) => dateKey(abstract.presentationStartAt) === date);
  const tracks = watchTracks.map((item) => item.track);
  const trackMatched = allAbstracts.filter((abstract) =>
    tracks.some((track) => trackMatches(track, abstract.track))
  );

  const seen = new Set<string>();
  return [...timed, ...trackMatched]
    .filter((abstract) => {
      if (seen.has(abstract.id)) {
        return false;
      }
      seen.add(abstract.id);
      return true;
    })
    .sort((a, b) => {
      const timedA = dateKey(a.presentationStartAt) === date ? 1 : 0;
      const timedB = dateKey(b.presentationStartAt) === date ? 1 : 0;
      return timedB - timedA || (a.presentationStartAt ?? "").localeCompare(b.presentationStartAt ?? "");
    })
    .slice(0, 12);
}

function familyFrames(watchTracks: { track: string }[]) {
  const tracks = watchTracks.map((item) => item.track);
  return TRACK_FAMILIES.filter((family) =>
    family.match.some((needle) => tracks.some((track) => track.toLowerCase().includes(needle.toLowerCase())))
  )
    .slice(0, 4)
    .map((family) => family.frame);
}

function buildNarrative(date: string, sessions: CoreSession[], abstracts: CoreAbstract[]): DayNarrative {
  const daySessions = sessions
    .filter((session) => dateKey(session.startAt) === date)
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
  const timedAbstracts = abstracts.filter((abstract) => dateKey(abstract.presentationStartAt) === date);
  const watchTracks = buildDayWatchTracks(daySessions, abstracts);
  const plenarySessions = selectPlenarySessions(daySessions);
  const tentpoleSessions = selectTentpoles(daySessions);
  const posterSessions = selectPosterSessions(daySessions);
  const oralAbstracts = selectOralAbstracts(date, abstracts);
  const abstractSignals = selectAbstractSignals(date, watchTracks, abstracts);
  const frames = familyFrames(watchTracks);
  const label = DAY_LABELS[date] ?? date;
  const topTrack = watchTracks[0]?.track ?? "the official ASCO program";
  const secondTrack = watchTracks[1]?.track ?? "cross-track oncology discussion";
  const headline = `${label}: ${topTrack} leads the day, with ${secondTrack} close behind`;
  const oneLine = `${daySessions.length} agenda sessions, ${oralAbstracts.length} oral abstract presentations, and ${timedAbstracts.length} total timed abstract presentations shape the day, while ${abstracts.length} embargoed abstract records provide title-level watch signals until full text is released.`;
  const broadcastArc = [
    `Open with the room map: ${daySessions.length} sessions are scheduled, and the leading tracks are ${watchTracks
      .slice(0, 4)
      .map((item) => item.track)
      .join(", ")}.`,
    plenarySessions.length > 0
      ? `Make the plenary session the editorial center of gravity for the day, then use oral abstract sessions to build the before-and-after context.`
      : `Use the oral abstract sessions as the evidence spine for the day, with education and special sessions providing context between data-heavy blocks.`,
    posterSessions.length > 0
      ? `Run poster wall and W-poster watch callouts for Hall A - Posters and Exhibits, especially when a poster session block opens.`
      : `Keep the poster wall callout ready for the next Hall A Posters and Exhibits block.`,
    frames[0] ?? "Frame the day as a scan across official sessions, oral abstracts, education blocks, and practical care-delivery themes.",
    frames[1] ?? "Use the abstract titles as watch signals only, because the current export marks abstract bodies as embargoed or pending.",
    `Close the day with a media-monitor reset: reviewed media and broadcast signals can interrupt the schedule spine, but they must be attributed and clearly labeled.`
  ];
  const audiencePrompts = [
    `Run this prompt during the morning ramp: ${EXHIBITOR_HALL_PROMPT}`,
    `Run this prompt around midday for source-backed intake: ${EXHIBITOR_HALL_PROMPT}`,
    `Run this prompt during the afternoon reset between session blocks: ${EXHIBITOR_HALL_PROMPT}`,
    `Run this prompt during late afternoon and before the wrap: ${WORKOUT_PROMPT}`,
    `Run this poster-floor prompt when Hall A traffic picks up: ${POSTER_WALL_PROMPT}`,
    `Run this media reset between agenda blocks: ${MEDIA_MONITOR_PROMPT}`
  ];

  return {
    date,
    label,
    headline,
    oneLine,
    broadcastArc,
    watchTracks,
    plenarySessions,
    tentpoleSessions,
    posterSessions,
    oralAbstracts,
    abstractSignals,
    audiencePrompts,
    hostOpen: `Welcome to ConferenceHype for ${label}. Turn it up: this is the live conference desk, radio-DJ style, source-forward and moving fast. Today the agenda leans into ${topTrack}, with ${secondTrack} also carrying major attention. We will use the official agenda as the spine, title-level abstract signals as watch points, and source-attributed interruptions. ${POSTER_WALL_PROMPT} ${EXHIBITOR_HALL_PROMPT}`,
    hostClose: `That is the ${label} arc: follow the official schedule, watch the high-density tracks, and treat every abstract-title signal as provisional until primary sources and full text are available. Keep tagging #ConferenceHype and @ConferenceHype on X with source-attributed articles, official schedule items, media links, or monitored X voice callouts you want the desk to review. ${DISCLAIMER}`
  };
}

function renderMarkdown(narratives: DayNarrative[], index: CoreIndex) {
  const embargoedCount = index.abstracts.filter((abstract) => abstract.abstractStatus === "embargoed_or_pending").length;
  const lines = [
    "# ASCO 2026 Broadcast Narrative Plan",
    "",
    `Generated from the local ASCO agenda and abstract index: ${index.sessions.length} sessions and ${index.abstracts.length} abstracts.`,
    "",
    `Important source limitation: ${embargoedCount} abstracts are currently marked embargoed or pending in the provided export. This plan uses session metadata, agenda topics, abstract titles, timing, speakers, and tracks. Refresh after full abstract text is available.`,
    "",
    `Location narration rule: McCormick Place is a multi-building campus. Repeat every meeting location out loud, then ask viewers to check the room in the ASCO app and on-site signage because meeting locations can change unexpectedly.`,
    "",
    `Audience prompt rule: At regular intervals, ask viewers on X to tag #ConferenceHype or @ConferenceHype with source-attributed articles, official schedule items, media links, or monitored X voice callouts. Do not use vague audience chatter in the broadcast rundown.`,
    `End-of-day movement prompt rule: Ask listeners to tag @ConferenceHype with steps, walks, runs, gym sessions, and other workouts. Treat those posts as reviewed audience shoutouts for the end-of-day broadcast, not medical or fitness advice.`,
    "",
    DISCLAIMER,
    ""
  ];

  for (const day of narratives) {
    lines.push(`## ${cleanText(day.headline)}`, "");
    lines.push(day.oneLine, "");
    lines.push("### Broadcast Arc", "");
    day.broadcastArc.forEach((item, index) => lines.push(`${index + 1}. ${cleanText(item)}`));
    lines.push("");
    lines.push("### Watch Tracks", "");
    for (const item of day.watchTracks) {
      lines.push(`- ${cleanText(item.track)}: ${item.sessionCount} agenda sessions; ${item.abstractCount} abstract-title signals in the provided export.`);
    }
    lines.push("");
    lines.push("### Plenary Session", "");
    if (day.plenarySessions.length === 0) {
      lines.push("- No plenary session is scheduled for this day in the provided agenda index.");
    } else {
      for (const session of day.plenarySessions) {
        lines.push(formatSessionLine(session));
        if (session.overview) {
          lines.push(`  - Narrative use: ${cleanText(session.overview)}`);
        } else if (session.topics) {
          const cleanedTopics = cleanText(session.topics);
          lines.push(`  - Narrative use: ${cleanedTopics.slice(0, 360)}${cleanedTopics.length > 360 ? "..." : ""}`);
        } else {
          lines.push("  - Narrative use: Treat this as the day's central live desk segment and build pre/post commentary around the official agenda block.");
        }
      }
    }
    lines.push("");
    lines.push("### Tentpole Sessions", "");
    for (const session of day.tentpoleSessions) {
      lines.push(formatSessionLine(session));
      if (session.overview) {
        lines.push(`  - Narrative use: ${cleanText(session.overview)}`);
      } else if (session.topics) {
        const cleanedTopics = cleanText(session.topics);
        lines.push(`  - Narrative use: ${cleanedTopics.slice(0, 260)}${cleanedTopics.length > 260 ? "..." : ""}`);
      }
    }
    lines.push("");
    lines.push(`### Poster Wall / W-Poster Watch (${day.posterSessions.length})`, "");
    if (day.posterSessions.length === 0) {
      lines.push(`- No poster session block is scheduled for this day in the provided agenda index. Keep the callout ready for Hall A - Posters and Exhibits on the next poster-heavy day.`);
    } else {
      for (const session of day.posterSessions) {
        lines.push(formatSessionLine(session));
        if (session.topics) {
          const cleanedTopics = cleanText(session.topics);
          lines.push(`  - DJ callout: Poster wall energy check. ${cleanedTopics.slice(0, 320)}${cleanedTopics.length > 320 ? "..." : ""}`);
        } else {
          lines.push("  - DJ callout: Poster wall energy check. Send viewers to check the Hall A poster location and tag #ConferenceHype with what is drawing attention.");
        }
      }
    }
    lines.push("");
    lines.push(`### All Oral Abstracts (${day.oralAbstracts.length})`, "");
    for (const abstract of day.oralAbstracts) {
      lines.push(formatAbstractLine(abstract, index.sessions));
    }
    lines.push("");
    lines.push("### Abstract Signals", "");
    for (const abstract of day.abstractSignals) {
      lines.push(formatAbstractLine(abstract, index.sessions));
    }
    lines.push("");
    lines.push("### Audience Prompts", "");
    for (const prompt of day.audiencePrompts) {
      lines.push(`- ${cleanText(prompt)}`);
    }
    lines.push("");
    lines.push("### Host Copy", "");
    lines.push(`Open: ${cleanText(day.hostOpen)}`, "");
    lines.push(`Close: ${cleanText(day.hostClose)}`, "");
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const index = readIndex();
  const dates = [...new Set(index.sessions.map((session) => dateKey(session.startAt)).filter((date) => date !== "no-date"))].sort();
  const narratives = dates.map((date) => buildNarrative(date, index.sessions, index.abstracts));
  const outputDir = path.join(process.cwd(), "data", "asco2026");
  const jsonPath = path.join(outputDir, "broadcast-narrative-plan.json");
  const mdPath = path.join(outputDir, "broadcast-narrative-plan.md");

  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "data/asco2026/core-index.json",
        limitation:
          "All abstracts in the current export are embargoed_or_pending, so this narrative uses title-level abstract signals and agenda metadata.",
        disclaimer: DISCLAIMER,
        narratives
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(mdPath, renderMarkdown(narratives, index));

  console.log(JSON.stringify({ days: narratives.length, jsonPath, mdPath }, null, 2));
}

main();
