import { appendFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
const startAt = process.env.BROADCAST_START_AT;
const durationSeconds = Number(process.env.BROADCAST_DURATION_SECONDS ?? "3600");
if (!startAt || Number.isNaN(new Date(startAt).getTime())) {
  throw new Error("BROADCAST_START_AT must be a valid ISO timestamp.");
}
const outputPath = process.env.GITHUB_OUTPUT;
if (!outputPath) {
  throw new Error("GITHUB_OUTPUT is required.");
}

const oauthConfigured = Boolean(
  process.env.YOUTUBE_OAUTH_CLIENT_ID &&
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET &&
    process.env.YOUTUBE_OAUTH_REFRESH_TOKEN
);

if (!oauthConfigured) {
  if (!process.env.YOUTUBE_RTMP_URL || !process.env.YOUTUBE_STREAM_KEY) {
    throw new Error(
      "Configure YouTube OAuth credentials for fresh videos, or provide the legacy RTMP URL and stream key."
    );
  }
  console.log("::warning::YouTube OAuth is not configured. Reusing the legacy broadcast instead of creating a fresh video.");
  console.log(`::add-mask::${process.env.YOUTUBE_STREAM_KEY}`);
  const legacyVideoId = process.env.YOUTUBE_LEGACY_VIDEO_ID ?? "";
  await appendFile(
    outputPath,
    [
      "youtube_mode=legacy",
      `youtube_video_id=${legacyVideoId}`,
      `youtube_url=${legacyVideoId ? `https://www.youtube.com/watch?v=${legacyVideoId}` : ""}`,
      `rtmp_url=${process.env.YOUTUBE_RTMP_URL}`,
      `stream_key=${process.env.YOUTUBE_STREAM_KEY}`
    ].join("\n") + "\n"
  );
  process.exit(0);
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
    refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN!,
    grant_type: "refresh_token"
  })
});
if (!tokenResponse.ok) {
  throw new Error(`YouTube OAuth refresh failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
}
const tokenPayload = (await tokenResponse.json()) as { access_token: string };
const authorization = `Bearer ${tokenPayload.access_token}`;
const scheduledStart = new Date(startAt);
const scheduledEnd = new Date(scheduledStart.getTime() + durationSeconds * 1000);

let metadata:
  | {
      title: string;
      description: string;
      tags: string[];
      categoryId: string;
      tier: "dominant" | "roundup" | "generic";
      journalName?: string;
      specialty?: string;
      dateLabel: string;
    }
  | undefined;
try {
  if (process.env.JOURNAL_ID) {
    // 30-minute single-journal show: this placeholder always gets
    // overwritten by render-hour-broadcast.ts's post-render metadata
    // rebuild once the real cards are known (same "single source of truth"
    // reasoning as the hourly path below), so a minimal, accurate-enough
    // title built from just the journal record is sufficient here -- no
    // need to run buildBroadcastSlots/buildJournalShowSlots against
    // not-yet-selected segments just for a title that's about to be
    // replaced anyway.
    const { getOncologyJournalsFromDb } = await import("@/lib/db");
    const journals = await getOncologyJournalsFromDb();
    const journal = (journals ?? []).find((candidate) => candidate.id === process.env.JOURNAL_ID);
    const label = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York"
    }).format(scheduledStart);
    metadata = {
      title: journal ? `ConferenceHype: ${journal.name} - ${label}` : `ConferenceHype live programming - ${label}`,
      description: "Source-attributed ConferenceHype medical-journal programming.",
      tags: journal ? [journal.name, ...(journal.specialty ? [journal.specialty] : [])] : [],
      categoryId: "27",
      tier: journal ? "dominant" : "generic",
      journalName: journal?.name,
      specialty: journal?.specialty,
      dateLabel: label
    };
  } else {
    const [
      { filterBroadcastReadySegments },
      { getNextBroadcastSegmentsFromDb, getOncologyJournalsFromDb, getConferenceCoverageSlotsFromDb, getMedicalConferencesFromDb },
      { buildBroadcastSlots },
      { buildBroadcastMetadata }
    ] = await Promise.all([
      import("@/lib/data"),
      import("@/lib/db"),
      import("@/lib/rundown/slots"),
      import("@/lib/youtube/broadcastMetadata")
    ]);
    const [rawApproved, journals, coverageSlots, conferences] = await Promise.all([
      getNextBroadcastSegmentsFromDb(120),
      getOncologyJournalsFromDb(),
      getConferenceCoverageSlotsFromDb(),
      getMedicalConferencesFromDb()
    ]);
    const approved = filterBroadcastReadySegments(rawApproved ?? []);
    // Title/description only need content + music slots, not the schedule
    // spine (schedule-spine cards never carry journal citations anyway).
    const slots = buildBroadcastSlots({
      segments: approved,
      scheduleSegments: [],
      baseTime: scheduledStart,
      hours: 1
    });
    const journalsById = new Map((journals ?? []).map((journal) => [journal.id, journal]));
    const activeSlot = (coverageSlots ?? []).find((slot) => slot.id === process.env.COVERAGE_SLOT_ID);
    const activeConference = activeSlot
      ? (conferences ?? []).find((conference) => conference.id === activeSlot.conferenceId)
      : undefined;
    metadata = buildBroadcastMetadata({
      hourStart: scheduledStart,
      conferenceName: activeConference?.acronym ?? activeConference?.name,
      slots,
      journalsById
    });
  }
} catch (error) {
  console.log(
    `::warning::Could not build journal-aware YouTube metadata, falling back to generic title/description: ${String(error)}`
  );
}

// GitHub Actions sets an env var from an output that was never echoed as an
// empty string, not undefined -- `??` would not fall through in that case,
// so an empty string must be treated the same as "not set" here.
const title =
  process.env.BROADCAST_TITLE ||
  metadata?.title ||
  `ConferenceHype live programming - ${scheduledStart.toISOString().slice(0, 16).replace("T", " ")}`;
const description =
  process.env.BROADCAST_DESCRIPTION ||
  metadata?.description ||
  "Source-attributed ConferenceHype medical-conference programming.";
const tags = metadata?.tags ?? [];
const categoryId = process.env.YOUTUBE_BROADCAST_CATEGORY_ID || metadata?.categoryId || "27";

const broadcastResponse = await fetch(
  "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snippet: {
        // liveBroadcasts' snippet has no categoryId/tags fields -- those
        // are set via a follow-up videos.update call below instead.
        title,
        description,
        scheduledStartTime: scheduledStart.toISOString(),
        scheduledEndTime: scheduledEnd.toISOString()
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS ?? "unlisted",
        selfDeclaredMadeForKids: false
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        recordFromStart: true,
        latencyPreference: "normal",
        monitorStream: { enableMonitorStream: false }
      }
    })
  }
);
if (!broadcastResponse.ok) {
  throw new Error(
    `YouTube broadcast creation failed: ${broadcastResponse.status} ${await broadcastResponse.text()}`
  );
}
const broadcast = (await broadcastResponse.json()) as { id: string };

// liveBroadcasts.insert's snippet has no categoryId/tags fields at all --
// those only exist on the *videos* resource's snippet, not liveBroadcasts.
// Confirmed via a live test (2026-07-11): the insert response echoed back
// categoryId=(none) tags=[] even though both were sent, meaning the API
// was silently ignoring them the entire time this feature was live.
// liveBroadcasts.insert creates an underlying video with the same id, so a
// follow-up videos.update targets that video directly. Non-blocking, same
// as the thumbnail step below -- must never prevent the broadcast/stream.
try {
  const videosUpdateResponse = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: broadcast.id,
      snippet: {
        title,
        description,
        tags,
        categoryId
      }
    })
  });
  if (!videosUpdateResponse.ok) {
    throw new Error(
      `videos.update failed: ${videosUpdateResponse.status} ${await videosUpdateResponse.text()}`
    );
  }
  console.log(`Set categoryId=${categoryId} and ${tags.length} tags for ${broadcast.id}`);
} catch (error) {
  console.log(`::warning::Could not set YouTube category/tags via videos.update: ${String(error)}`);
}

// Custom thumbnail, built from the exact same resolved metadata (tier,
// journal, specialty) the title/description already used -- never a second,
// independent resolution, so the thumbnail can't disagree with the title.
// Requires the YouTube channel to be phone-verified; if it isn't, or the
// site fetch/upload fails for any reason, this must never block the
// broadcast itself (title/description/tags/category and the stream are
// already committed above).
try {
  if (metadata) {
    const siteUrl = process.env.PUBLIC_SITE_URL || "https://conferencehype.com";
    const thumbnailParams = new URLSearchParams({ tier: metadata.tier, date: metadata.dateLabel });
    if (metadata.journalName) thumbnailParams.set("journal", metadata.journalName);
    if (metadata.specialty) thumbnailParams.set("specialty", metadata.specialty);
    const thumbnailResponse = await fetch(`${siteUrl}/api/youtube-thumbnail?${thumbnailParams.toString()}`);
    if (!thumbnailResponse.ok) {
      throw new Error(`Thumbnail render failed: ${thumbnailResponse.status} ${await thumbnailResponse.text()}`);
    }
    const thumbnailBytes = await thumbnailResponse.arrayBuffer();
    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(broadcast.id)}`,
      {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "image/png" },
        body: thumbnailBytes
      }
    );
    if (!uploadResponse.ok) {
      throw new Error(`Thumbnail upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
    }
    console.log(`Set custom thumbnail (tier: ${metadata.tier}) for ${broadcast.id}`);
  }
} catch (error) {
  console.log(
    `::warning::Could not set a custom YouTube thumbnail (channel may not be phone-verified yet): ${String(error)}`
  );
}

const streamResponse = await fetch(
  "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails",
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snippet: { title: `${title} ingest` },
      cdn: {
        frameRate: "30fps",
        ingestionType: "rtmp",
        resolution: "1080p"
      },
      contentDetails: { isReusable: false }
    })
  }
);
if (!streamResponse.ok) {
  throw new Error(
    `YouTube live stream creation failed: ${streamResponse.status} ${await streamResponse.text()}`
  );
}
const stream = (await streamResponse.json()) as {
  id: string;
  cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } };
};

const bindResponse = await fetch(
  `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${encodeURIComponent(
    broadcast.id
  )}&streamId=${encodeURIComponent(stream.id)}&part=id,contentDetails`,
  {
    method: "POST",
    headers: { Authorization: authorization }
  }
);
if (!bindResponse.ok) {
  throw new Error(`YouTube broadcast bind failed: ${bindResponse.status} ${await bindResponse.text()}`);
}

console.log(`::add-mask::${stream.cdn.ingestionInfo.streamName}`);
await appendFile(
  outputPath,
  [
    "youtube_mode=fresh",
    `youtube_video_id=${broadcast.id}`,
    `youtube_url=https://www.youtube.com/watch?v=${broadcast.id}`,
    `rtmp_url=${stream.cdn.ingestionInfo.ingestionAddress}`,
    `stream_key=${stream.cdn.ingestionInfo.streamName}`
  ].join("\n") + "\n"
);
console.log(`Created YouTube broadcast https://www.youtube.com/watch?v=${broadcast.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
