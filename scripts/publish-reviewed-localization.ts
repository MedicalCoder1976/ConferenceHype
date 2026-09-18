import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getYoutubeAccessToken, uploadVideoToYoutube } from "@/lib/youtube/uploadBroadcastVideo";

async function main() {
  const metadataPath = path.resolve(process.argv[2]);
  const directory = path.dirname(metadataPath);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  if (!metadata.reviewed || metadata.language !== process.env.LANGUAGE || !["ko", "ja"].includes(metadata.language)) throw new Error("Reviewed language mismatch.");
  if (sha(await readFile(process.env.PACKAGE_PATH!)) !== metadata.package_sha256) throw new Error("Translation package changed after rendering.");
  if (sha(await readFile(path.join(directory, "edition.mp4"))) !== metadata.video_sha256) throw new Error("Rendered video hash mismatch.");
  if (!metadata.quality?.narration_pages?.length || metadata.quality.narration_pages.some((p: {mean_db: number}) => !Number.isFinite(p.mean_db) || p.mean_db < -40) || metadata.quality.music_windows !== 0) throw new Error("Narration QA failed.");
  const token = await getYoutubeAccessToken();
  async function api(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!response.ok) throw new Error(`YouTube ${response.status}: ${await response.text()}`);
    return response.json();
  }
  const statePath = path.join(directory, "youtube-result.json");
  let state: { id?: string; status?: string; youtube_url?: string; youtube?: unknown } = {};
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* First upload. */ }
  if (!state.id) {
    const found = await api(`https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=25&q=${encodeURIComponent(metadata.title)}`);
    state.id = found.items?.find((item: {snippet: {title: string}; id: {videoId: string}}) => item.snippet.title === metadata.title)?.id.videoId;
  }
  if (!state.id) {
    const uploaded = await uploadVideoToYoutube({filePath: path.join(directory, "edition.mp4"), accessToken: token, title: metadata.title, description: metadata.description, tags: ["WCLC 2026", "Oncology", metadata.language === "ko" ? "한국어" : "日本語", "ConferenceHype"], categoryId: "28", privacyStatus: "private"});
    state = {id: uploaded.id, status: "private-uploaded"};
    await writeFile(statePath, JSON.stringify(state, null, 2));
  }
  let item;
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
    item = result.items?.[0];
    if (item?.status?.uploadStatus === "processed") break;
    if (["failed", "rejected", "deleted"].includes(item?.status?.uploadStatus) || attempt === 59) throw new Error("Processing failed or timed out; video remains private.");
    console.log("Waiting for private video processing", state.id);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  await api("https://www.googleapis.com/youtube/v3/videos?part=snippet", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({id: state.id, snippet: {title: metadata.title, description: metadata.description, categoryId: "28", tags: item.snippet.tags, defaultLanguage: metadata.language, defaultAudioLanguage: metadata.language}})});
  const thumbnail = await readFile(path.join(directory, "thumbnail.png"));
  await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${state.id}`, {method: "POST", headers: {"Content-Type": "image/png"}, body: thumbnail});
  const boundary = `localized-${Date.now()}`;
  const caption = await readFile(path.join(directory, "edition.srt"));
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({snippet: {videoId: state.id, language: metadata.language, name: metadata.language === "ko" ? "한국어" : "日本語", isDraft: false}})}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), caption, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  try {
    await api("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", {method: "POST", headers: {"Content-Type": `multipart/related; boundary=${boundary}`}, body});
  } catch (error) {
    if (!/403[\s\S]*(?:scope|insufficient)|409/.test(String(error))) throw error;
    console.log("Separate captions unavailable or already present; full narration text is visible in the video.");
  }
  await api("https://www.googleapis.com/youtube/v3/videos?part=status", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({id: state.id, status: {privacyStatus: "public", selfDeclaredMadeForKids: false, embeddable: true}})});
  const verified = await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
  const video = verified.items?.[0];
  if (video?.status.privacyStatus !== "public" || video?.status.uploadStatus !== "processed" || video?.snippet.defaultAudioLanguage !== metadata.language || video?.snippet.title !== metadata.title) throw new Error("Public language/title verification failed.");
  state = {...state, status: "verified", youtube_url: `https://www.youtube.com/watch?v=${state.id}`, youtube: video};
  await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({status: state.status, url: state.youtube_url, title: video.snippet.title, duration: video.contentDetails.duration}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
