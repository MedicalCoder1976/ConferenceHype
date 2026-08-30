import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

const YOUTUBE_TITLE_MAX_LENGTH = 100;
const YOUTUBE_DESCRIPTION_MAX_BYTES = 5000;
const YOUTUBE_TAGS_MAX_LENGTH = 500;

function youtubeTagListLength(tags: string[]) {
  return tags.reduce(
    (total, tag, index) => total + Array.from(tag).length + (/\s/.test(tag) ? 2 : 0) + (index ? 1 : 0),
    0
  );
}

export function normalizeYoutubeTags(tags: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of tags) {
    const tag = rawTag.trim().replace(/\s+/g, " ");
    const key = tag.toLocaleLowerCase("en-US");
    if (!tag || seen.has(key)) continue;
    const candidate = [...normalized, tag];
    if (youtubeTagListLength(candidate) > YOUTUBE_TAGS_MAX_LENGTH) continue;
    normalized.push(tag);
    seen.add(key);
  }
  return normalized;
}

export function removeViewerGroundingLabels(value: string) {
  return value
    .replace(/\bsource[- ]grounded\b/gi, "")
    .replace(/\s*--\s*no fabricated claims\s*,?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function normalizeYoutubeTitle(value: string) {
  const title = removeViewerGroundingLabels(value)
    .replace(/\s*<\s*/g, " less than ")
    .replace(/\s*>\s*/g, " greater than ")
    .replace(/\s+/g, " ");
  if (Array.from(title).length <= YOUTUBE_TITLE_MAX_LENGTH) return title;
  const available = YOUTUBE_TITLE_MAX_LENGTH - 1;
  const prefix = Array.from(title).slice(0, available).join("");
  const lastSpace = prefix.lastIndexOf(" ");
  const wordSafePrefix = lastSpace >= Math.floor(available * 0.75) ? prefix.slice(0, lastSpace) : prefix;
  return `${wordSafePrefix.trimEnd()}…`;
}

export function normalizeYoutubeDescription(value: string) {
  const description = removeViewerGroundingLabels(value)
    .replace(/[ \t]*<[ \t]*/g, " less than ")
    .replace(/[ \t]*>[ \t]*/g, " greater than ")
    .replace(/[ \t]{2,}/g, " ");
  const encoder = new TextEncoder();
  if (encoder.encode(description).length <= YOUTUBE_DESCRIPTION_MAX_BYTES) return description;

  const suffix = "…";
  const availableBytes = YOUTUBE_DESCRIPTION_MAX_BYTES - encoder.encode(suffix).length;
  let bytes = 0;
  let prefix = "";
  for (const character of description) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > availableBytes) break;
    prefix += character;
    bytes += characterBytes;
  }
  const lastWhitespace = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"));
  if (lastWhitespace >= Math.floor(prefix.length * 0.75)) prefix = prefix.slice(0, lastWhitespace);
  return `${prefix.trimEnd()}${suffix}`;
}

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
  categoryId,
  publishAt,
  privacyStatus
}: {
  filePath: string;
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  publishAt?: string;
  privacyStatus?: "private" | "public";
}): Promise<{ id: string; status?: { privacyStatus?: string; publishAt?: string } }> {
  const youtubeTitle = normalizeYoutubeTitle(title);
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
        snippet: { title: youtubeTitle, description: normalizeYoutubeDescription(description), tags: normalizeYoutubeTags(tags), categoryId },
        status: {
          // Scheduled publishing is opt-in. All manual/admin uploads omit
          // publishAt and retain their existing immediate-public behavior.
          privacyStatus: publishAt ? "private" : privacyStatus ?? "public",
          ...(publishAt ? { publishAt } : {}),
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
  const uploaded = (await uploadResponse.json()) as { id: string; status?: { privacyStatus?: string; publishAt?: string } };
  if (publishAt && (uploaded.status?.privacyStatus !== "private" || !uploaded.status.publishAt || new Date(uploaded.status.publishAt).getTime() !== new Date(publishAt).getTime())) {
    throw new Error(`YouTube did not confirm scheduled publication for ${publishAt}.`);
  }
  const expectedPrivacyStatus = publishAt ? "private" : privacyStatus ?? "public";
  if (!publishAt && uploaded.status?.privacyStatus !== expectedPrivacyStatus) {
    throw new Error(`YouTube did not confirm ${expectedPrivacyStatus} visibility for uploaded video ${uploaded.id}.`);
  }
  return uploaded;
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
  const youtubeTitle = normalizeYoutubeTitle(title);
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
      snippet: { ...snippet, title: youtubeTitle, description: normalizeYoutubeDescription(description), tags: normalizeYoutubeTags(tags), categoryId }
    })
  });
  if (!updateResponse.ok) {
    throw new Error(`YouTube metadata update failed: ${updateResponse.status} ${await updateResponse.text()}`);
  }
}
export type YoutubeThumbnailSpec = {
  tier: string;
  journalName?: string;
  specialty?: string;
  dateLabel: string;
  headline?: string;
  topicLabel?: string;
  entityLabel?: string;
  journalNames?: string[];
  journalCount?: number;
  panelLabel?: string;
  seriesLabel?: string;
  journalSeriesName?: string;
  detailLabel?: string;
  promiseLabel?: string;
  journalClub?: boolean;
  articleTitle?: string;
  cleanStoryLayout?: boolean;
  fiveThings?: boolean;
  meetingWatch?: boolean;
  variant?: "thumbnail" | "persistent-frame";
  siteUrl?: string;
};

export async function downloadYoutubeThumbnail({
  tier,
  journalName,
  specialty,
  dateLabel,
  headline,
  journalNames,
  topicLabel,
  entityLabel,
  journalCount,
  panelLabel,
  seriesLabel,
  journalSeriesName,
  detailLabel,
  promiseLabel,
  journalClub,
  articleTitle,
  cleanStoryLayout,
  fiveThings,
  meetingWatch,
  variant,
  siteUrl
}: YoutubeThumbnailSpec) {
  const resolvedSiteUrl = siteUrl || "https://conferencehype.com";
  const params = new URLSearchParams({ tier, date: dateLabel });
  if (journalName) params.set("journal", journalName);
  if (specialty) params.set("specialty", specialty);
  if (headline) params.set("headline", headline);
  journalNames?.slice(0, 2).forEach((name) => params.append("journalName", name));
  if (journalCount) params.set("journalCount", String(journalCount));
  if (topicLabel) params.set("topicLabel", topicLabel);
  if (entityLabel) params.set("entityLabel", entityLabel);
  if (panelLabel) params.set("panelLabel", panelLabel);
  if (seriesLabel) params.set("seriesLabel", seriesLabel);
  if (journalSeriesName) params.set("journalSeriesName", journalSeriesName);
  if (detailLabel) params.set("detailLabel", detailLabel);
  if (promiseLabel) params.set("promiseLabel", promiseLabel);
  if (journalClub) params.set("journalClub", "1");
  if (articleTitle) params.set("articleTitle", articleTitle);
  if (cleanStoryLayout) params.set("storyLayout", "clean");
  if (fiveThings) params.set("fiveThings", "1");
  if (meetingWatch) params.set("meetingWatch", "1");
  if (variant) params.set("variant", variant);
  const thumbnailResponse = await fetch(`${resolvedSiteUrl}/api/youtube-thumbnail?${params.toString()}`);
  if (!thumbnailResponse.ok) {
    throw new Error(`Thumbnail render failed: ${thumbnailResponse.status} ${await thumbnailResponse.text()}`);
  }
  return new Uint8Array(await thumbnailResponse.arrayBuffer());
}

export async function uploadYoutubeThumbnail({
  videoId,
  accessToken,
  thumbnailBytes,
  ...thumbnailSpec
}: YoutubeThumbnailSpec & {
  videoId: string;
  accessToken: string;
  thumbnailBytes?: Uint8Array<ArrayBuffer>;
}) {
  const resolvedThumbnailBytes = thumbnailBytes ?? await downloadYoutubeThumbnail(thumbnailSpec);
  const uploadResponse = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
      body: resolvedThumbnailBytes.buffer
    }
  );
  if (!uploadResponse.ok) {
    throw new Error(`Thumbnail upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  }
}
