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
const title =
  process.env.BROADCAST_TITLE ??
  `ConferenceHype live programming - ${scheduledStart.toISOString().slice(0, 16).replace("T", " ")}`;

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
        title,
        description:
          process.env.BROADCAST_DESCRIPTION ??
          "Source-attributed ConferenceHype medical-conference programming.",
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
