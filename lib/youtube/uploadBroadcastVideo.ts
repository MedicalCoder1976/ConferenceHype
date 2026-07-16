import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

// Replaces the old live-broadcast + RTMP pipeline: instead of streaming a
// pre-rendered file to YouTube in real time, upload the finished file
// directly and let YouTube's own scheduled-publish feature make it public
// at the right time. privacyStatus must be "private" at upload time for
// publishAt to take effect -- YouTube ignores publishAt otherwise.
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
  categoryId,
  publishAt
}: {
  filePath: string;
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  publishAt: string;
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
          // Required combination for a scheduled release -- YouTube only
          // honors publishAt when the video starts private.
          privacyStatus: "private",
          publishAt,
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

export async function uploadYoutubeThumbnail({
  videoId,
  accessToken,
  tier,
  journalName,
  specialty,
  dateLabel,
  siteUrl
}: {
  videoId: string;
  accessToken: string;
  tier: string;
  journalName?: string;
  specialty?: string;
  dateLabel: string;
  siteUrl?: string;
}) {
  const resolvedSiteUrl = siteUrl || "https://conferencehype.com";
  const params = new URLSearchParams({ tier, date: dateLabel });
  if (journalName) params.set("journal", journalName);
  if (specialty) params.set("specialty", specialty);
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
