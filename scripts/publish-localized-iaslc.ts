import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getYoutubeAccessToken,
  normalizeYoutubeTitle,
  uploadVideoToYoutube
} from "@/lib/youtube/uploadBroadcastVideo";

type Metadata = {
  broadcast_id: string;
  source_video_id: string;
  language: "ko" | "ja" | "zh-Hans";
  language_name: string;
  language_native: string;
  title: string;
  description: string;
  video_path: string;
  subtitle_path: string;
};

async function findExistingVideo(title: string, accessToken: string) {
  const normalizedTitle = normalizeYoutubeTitle(title);
  const search = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=25&q=${encodeURIComponent(normalizedTitle)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!search.ok) throw new Error(`YouTube duplicate check failed: ${search.status} ${await search.text()}`);
  const result = await search.json() as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }> };
  return result.items?.find((item) => item.snippet?.title === normalizedTitle)?.id?.videoId;
}

async function uploadCaptionTrack(metadata: Metadata, videoId: string, accessToken: string) {
  const caption = await readFile(metadata.subtitle_path);
  if (caption.length < 100) throw new Error("Subtitle file is missing or unexpectedly short.");
  const boundary = `conferencehype-${Date.now()}`;
  const resource = Buffer.from(JSON.stringify({
    snippet: {
      videoId,
      language: metadata.language,
      name: `${metadata.language_name} captions`,
      isDraft: false
    }
  }));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    resource,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n`),
    caption,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const response = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": String(body.length)
      },
      body
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 403 && /insufficient|scope/i.test(detail)) {
      console.warn("YouTube OAuth lacks caption scope; retaining verified burned-in subtitles.");
      return { id: undefined, skipped: true as const };
    }
    throw new Error(`YouTube caption upload failed: ${response.status} ${detail}`);
  }
  return response.json() as Promise<{ id: string; skipped?: false }>;
}

async function verifyPublished(videoId: string, language: string, accessToken: string, requireCaption = true) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,snippet&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new Error(`YouTube verification lookup failed: ${response.status}`);
  const result = await response.json() as {
    items?: Array<{ status?: { privacyStatus?: string; uploadStatus?: string }; contentDetails?: { duration?: string }; snippet?: { title?: string } }>;
  };
  const item = result.items?.[0];
  if (!item || item.status?.privacyStatus !== "public" || item.status?.uploadStatus !== "processed") {
    throw new Error(`YouTube did not confirm a processed public ${language} video.`);
  }
  if (!requireCaption) return item;
  const captions = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!captions.ok) throw new Error(`YouTube caption verification failed: ${captions.status}`);
  const captionResult = await captions.json() as { items?: Array<{ snippet?: { language?: string; status?: string } }> };
  if (!captionResult.items?.some((track) => track.snippet?.language === language && track.snippet?.status === "serving")) {
    throw new Error(`YouTube did not confirm a serving ${language} caption track.`);
  }
  return item;
}

async function makePublic(videoId: string, accessToken: string) {
  const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: videoId,
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, embeddable: true }
    })
  });
  if (!response.ok) throw new Error(`YouTube public-release update failed: ${response.status} ${await response.text()}`);
}

async function main() {
  const metadataPath = process.argv[2];
  if (!metadataPath) throw new Error("Usage: tsx scripts/publish-localized-iaslc.ts <metadata.json>");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Metadata;
  const accessToken = await getYoutubeAccessToken();
  const existingVideoId = await findExistingVideo(metadata.title, accessToken);
  if (existingVideoId) {
    let existing;
    let captionId: string | undefined;
    try {
      existing = await verifyPublished(existingVideoId, metadata.language, accessToken);
    } catch {
      // Recover a previous fail-closed upload that remained private before its
      // caption track or public-release update completed.
      try {
        const caption = await uploadCaptionTrack(metadata, existingVideoId, accessToken);
        captionId = caption.id;
        await makePublic(existingVideoId, accessToken);
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            existing = await verifyPublished(existingVideoId, metadata.language, accessToken, !caption.skipped);
            break;
          } catch (error) {
            if (attempt === 49) throw error;
            await new Promise((resolve) => setTimeout(resolve, 30_000));
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || !/409|captionExists/.test(error.message)) throw error;
        await makePublic(existingVideoId, accessToken);
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            existing = await verifyPublished(existingVideoId, metadata.language, accessToken);
            break;
          } catch (verifyError) {
            if (attempt === 49) throw verifyError;
            await new Promise((resolve) => setTimeout(resolve, 30_000));
          }
        }
      }
    }
    const result = {
      ...metadata,
      youtube_video_id: existingVideoId,
      youtube_url: `https://www.youtube.com/watch?v=${existingVideoId}`,
      caption_id: captionId,
      status: captionId ? "verified-existing" : "verified-existing-burned-in-subtitles",
      youtube: existing
    };
    const existingResultPath = path.resolve(path.dirname(metadataPath), `${metadata.broadcast_id}-${metadata.language}-result.json`);
    await writeFile(existingResultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    return;
  }
  const uploaded = await uploadVideoToYoutube({
    filePath: metadata.video_path,
    accessToken,
    title: metadata.title,
    description: metadata.description,
    tags: ["IASLC", "WCLC 2026", "lung cancer", metadata.language_name, "medical conference"],
    categoryId: "28",
    // Keep it private until the separate caption track has uploaded.
    privacyStatus: "private"
  });
  const caption = await uploadCaptionTrack(metadata, uploaded.id, accessToken);

  // Processing is asynchronous. Poll for at most 25 minutes and fail closed;
  // the uploaded video ID is saved immediately so a retry never duplicates it.
  const resultPath = path.resolve(path.dirname(metadataPath), `${metadata.broadcast_id}-${metadata.language}-result.json`);
  await writeFile(resultPath, JSON.stringify({ ...metadata, youtube_video_id: uploaded.id, caption_id: caption.id, status: "processing" }, null, 2));
  await makePublic(uploaded.id, accessToken);
  let verified;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      verified = await verifyPublished(uploaded.id, metadata.language, accessToken, !caption.skipped);
      break;
    } catch (error) {
      if (attempt === 49) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }
  const final = {
    ...metadata,
    youtube_video_id: uploaded.id,
    youtube_url: `https://www.youtube.com/watch?v=${uploaded.id}`,
    caption_id: caption.id,
    status: caption.skipped ? "verified-burned-in-subtitles" : "verified",
    youtube: verified
  };
  await writeFile(resultPath, JSON.stringify(final, null, 2));
  console.log(JSON.stringify(final));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
