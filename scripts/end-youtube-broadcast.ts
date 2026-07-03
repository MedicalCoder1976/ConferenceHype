import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const videoId = process.env.YOUTUBE_VIDEO_ID;
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!videoId) {
    throw new Error("YOUTUBE_VIDEO_ID is required.");
  }
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

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&part=status&id=${encodeURIComponent(videoId)}`,
    { method: "POST", headers: { Authorization: `Bearer ${tokenPayload.access_token}` } }
  );
  if (!response.ok) {
    throw new Error(`YouTube broadcast transition failed: ${response.status} ${await response.text()}`);
  }

  console.log(JSON.stringify({ ok: true, videoId, transitionedTo: "complete" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
