import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

// Replaces the old live-broadcast + RTMP pipeline: instead of streaming a
// pre-rendered file to YouTube in real time, upload the finished file
// directly. Goes public immediately on upload (2026-07-17) -- an earlier
// version scheduled a delayed release, but that added real complexity (a
// wall-clock "is this the currently airing one" derivation, a stream_state
// singleton picking the wrong queued video when multiple slots were queued
// ahead of time) that a "just publish now" model doesn't need.
export async function getYoutubeAccessToken() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube OAuth credentials are not configured.");
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
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };
  return accessToken;
}

export async function uploadVideoToYoutube({
  filePath,
  accessToken,
  title,
  description,
  tags,
  categoryId
}: {
  filePath: string;
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}): Promise<{ id: string }> {
  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4"
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId },
        status: {
          // Always public immediately on upload -- no more delayed-release
          // scheduling. That added real complexity (a wall-clock "is this
          // currently live" derivation, a stream_state singleton picking the
          // wrong queued video when multiple slots were scheduled ahead of
          // time) for a benefit that didn't hold up: render+upload already
          // finishes close to the intended air time in the common
          // cron-triggered case, so "public immediately" and "public at the
          // scheduled time" rarely differed in practice.
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
          embeddable: true
        }
      })
    }
  );
  if (!initResponse.ok) {
    throw new Error(
      `YouTube upload session init failed: ${initResponse.status} ${await initResponse.text()}`
    );
  }
  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube did not return a resumable upload URL.");
  }

  const fileSize = statSync(filePath).size;
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize)
    },
    // Node's fetch requires duplex:"half" for a streaming request body.
    body: Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream,
    duplex: "half"
  } as RequestInit & { duplex: string });
  if (!uploadResponse.ok) {
    throw new Error(
      `YouTube video upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`
    );
  }
  return (await uploadResponse.json()) as { id: string };
}

export async function updateYoutubeVideoMetadata({
  videoId,
  accessToken,
  title,
  description,
  tags,
  categoryId
}: {
  videoId: string;
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}) {
  const currentResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!currentResponse.ok) {
    throw new Error(`YouTube metadata lookup failed: ${currentResponse.status} ${await currentResponse.text()}`);
  }
  const current = (await currentResponse.json()) as { items?: Array<{ snippet?: Record<string, unknown> }> };
  const snippet = current.items?.[0]?.snippet;
  if (!snippet) throw new Error(`YouTube video ${videoId} was not found.`);
  const updateResponse = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: videoId,
      snippet: { ...snippet, title, description, tags, categoryId }
    })
  });
  if (!updateResponse.ok) {
    throw new Error(`YouTube metadata update failed: ${updateResponse.status} ${await updateResponse.text()}`);
  }
}
export async function uploadYoutubeThumbnail({
  videoId,
  accessToken,
  tier,
  journalName,
  specialty,
  dateLabel,
  headline,
  siteUrl
}: {
  videoId: string;
  accessToken: string;
  tier: string;
  journalName?: string;
  specialty?: string;
  dateLabel: string;
  headline?: string;
  siteUrl?: string;
}) {
  const resolvedSiteUrl = siteUrl || "https://conferencehype.com";
  const params = new URLSearchParams({ tier, date: dateLabel });
  if (journalName) params.set("journal", journalName);
  if (specialty) params.set("specialty", specialty);
  if (headline) params.set("headline", headline);
  const thumbnailResponse = await fetch(`${resolvedSiteUrl}/api/youtube-thumbnail?${params.toString()}`);
  if (!thumbnailResponse.ok) {
    throw new Error(`Thumbnail render failed: ${thumbnailResponse.status} ${await thumbnailResponse.text()}`);
  }
  const thumbnailBytes = await thumbnailResponse.arrayBuffer();
  const uploadResponse = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
      body: thumbnailBytes
    }
  );
  if (!uploadResponse.ok) {
    throw new Error(`Thumbnail upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  }
}
