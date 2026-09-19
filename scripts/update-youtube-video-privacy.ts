import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";

loadEnvConfig(process.cwd());

async function getYoutubeAccessToken() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing YouTube OAuth credentials.");
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!tokenResponse.ok) {
    throw new Error(`YouTube OAuth refresh failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("YouTube OAuth response did not include an access token.");
  }
  return tokenPayload.access_token;
}

async function main() {
  const videoId = process.env.YOUTUBE_VIDEO_ID;
  const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS ?? "public";
  if (!videoId) {
    throw new Error("YOUTUBE_VIDEO_ID is required.");
  }
  if (!["public", "unlisted", "private"].includes(privacyStatus)) {
    throw new Error("YOUTUBE_PRIVACY_STATUS must be public, unlisted, or private.");
  }

  const accessToken = await getYoutubeAccessToken();
  const authorization = `Bearer ${accessToken}`;
  const videoLookup = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: authorization } }
  );
  if (!videoLookup.ok) {
    throw new Error(`YouTube video lookup failed: ${videoLookup.status} ${await videoLookup.text()}`);
  }
  const videoPayload = (await videoLookup.json()) as {
    items?: Array<{ id: string; status?: Record<string, unknown> }>;
  };
  const video = videoPayload.items?.[0];
  if (!video) {
    throw new Error(`YouTube video ${videoId} was not found.`);
  }

  const videoUpdate = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: videoId,
      status: {
        ...video.status,
        privacyStatus
      }
    })
  });
  if (!videoUpdate.ok) {
    throw new Error(`YouTube video privacy update failed: ${videoUpdate.status} ${await videoUpdate.text()}`);
  }

  const broadcastLookup = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: authorization } }
  );
  if (broadcastLookup.ok) {
    const broadcastPayload = (await broadcastLookup.json()) as {
      items?: Array<{ id: string; status?: Record<string, unknown> }>;
    };
    const broadcast = broadcastPayload.items?.[0];
    if (broadcast) {
      const broadcastUpdate = await fetch("https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status", {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: videoId,
          status: {
            ...broadcast.status,
            privacyStatus
          }
        })
      });
      if (!broadcastUpdate.ok) {
        console.log(
          `::warning::YouTube liveBroadcast privacy update failed: ${broadcastUpdate.status} ${await broadcastUpdate.text()}`
        );
      }
    }
  }

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const verification = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: authorization } });
    if (!verification.ok) throw new Error(`YouTube verification failed: ${verification.status}`);
    const current = (await verification.json()).items?.[0];
    if (current?.status?.privacyStatus === privacyStatus && (privacyStatus !== "public" || current.status.uploadStatus === "processed")) {
      const evidence = { ok: true, videoId, privacyStatus, uploadStatus: current.status.uploadStatus, title: current.snippet.title, duration: current.contentDetails.duration, verifiedAt: new Date().toISOString() };
      await writeFile("youtube-privacy-result.json", JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence, null, 2));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error("YouTube privacy/processing state did not verify.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
