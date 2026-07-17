import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

type VerifyOptions = {
  youtubeVideoId: string;
  youtubeUrl?: string;
  mediaPath?: string;
  siteUrl?: string;
  publishAt?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
  // broadcast_writeouts has a strict FK to conference_coverage_slots and a
  // duration_minutes=60 check, so a 30-minute journal show never writes one
  // (see render-hour-broadcast.ts's isJournalMode guard) -- set this to skip
  // the writeout-alignment check for those runs rather than polling for a
  // table row that structurally can't exist until the timeout is exhausted.
  skipWriteoutCheck?: boolean;
};

type YoutubeVideoStatus = {
  foundOnYoutube: boolean;
  watchPageReachable: boolean;
  uploadStatus?: string;
  privacyStatus?: string;
  publishAt?: string;
  embeddable?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

export async function assertMediaGenerated(mediaPath?: string) {
  if (!mediaPath) {
    return;
  }
  await access(mediaPath);
  const [videoStreams, audioStreams] = await Promise.all([
    run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      mediaPath
    ]),
    run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      mediaPath
    ])
  ]);
  if (!videoStreams.trim()) {
    throw new Error(`Rendered media ${mediaPath} has no video stream.`);
  }
  if (!audioStreams.trim()) {
    throw new Error(`Rendered media ${mediaPath} has no audio stream.`);
  }
}

async function getYoutubeAccessToken() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return undefined;
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
  return tokenPayload.access_token;
}

async function getYoutubeStatus(videoId: string): Promise<YoutubeVideoStatus> {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) {
    await assertYoutubeWatchPage(videoId);
    return { foundOnYoutube: true, watchPageReachable: true };
  }

  const videoResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!videoResponse.ok) {
    throw new Error(`YouTube video lookup failed: ${videoResponse.status} ${await videoResponse.text()}`);
  }
  const videoPayload = (await videoResponse.json()) as {
    items?: Array<{
      status?: {
        uploadStatus?: string;
        privacyStatus?: string;
        publishAt?: string;
        embeddable?: boolean;
      };
    }>;
  };
  const video = videoPayload.items?.[0];
  if (!video) {
    throw new Error(`YouTube video ${videoId} was not found.`);
  }
  // A newly uploaded video isn't always reachable on the public watch page
  // immediately (YouTube indexing lag), so this is a soft check -- don't
  // fail the whole verification over it.
  const watchPageReachable = await assertYoutubeWatchPage(videoId).then(
    () => true,
    () => false
  );
  return {
    foundOnYoutube: true,
    watchPageReachable,
    uploadStatus: video.status?.uploadStatus,
    privacyStatus: video.status?.privacyStatus,
    publishAt: video.status?.publishAt,
    embeddable: video.status?.embeddable
  };
}

async function assertYoutubeWatchPage(videoId: string) {
  const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    redirect: "follow"
  });
  if (!page.ok) {
    throw new Error(`YouTube watch page returned ${page.status}.`);
  }
  const html = await page.text();
  if (!html.includes(videoId) || /"status"\s*:\s*"ERROR"/i.test(html)) {
    throw new Error(`YouTube watch page did not expose saved/playable video ${videoId}.`);
  }
}

async function assertPublicState(options: VerifyOptions) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: streamState, error: streamError } = await supabase
    .from("stream_state")
    .select("youtube_video_id,youtube_status,youtube_url,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (streamError) {
    throw streamError;
  }
  if (streamState?.youtube_video_id !== options.youtubeVideoId) {
    throw new Error(
      `Public stream_state has video ${streamState?.youtube_video_id ?? "none"}; expected ${options.youtubeVideoId}.`
    );
  }
  if (streamState?.youtube_status !== "queued") {
    throw new Error(`Public stream_state is ${streamState?.youtube_status}; expected queued.`);
  }

  if (options.skipWriteoutCheck) {
    return;
  }

  const { data: writeout, error: writeoutError } = await supabase
    .from("broadcast_writeouts")
    .select("id,status,youtube_video_id,cards")
    .eq("youtube_video_id", options.youtubeVideoId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (writeoutError) {
    throw writeoutError;
  }
  const cards = Array.isArray(writeout?.cards) ? writeout.cards : [];
  if (!writeout || cards.length === 0) {
    throw new Error(`No saved writeout/cards found for YouTube video ${options.youtubeVideoId}.`);
  }
}

async function assertPublicPage(options: VerifyOptions) {
  const siteUrl = options.siteUrl ?? "https://conferencehype.com";
  const response = await fetch(siteUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${siteUrl} returned ${response.status}.`);
  }
  const html = await response.text();
  const encodedWatch = encodeURIComponent(`https://www.youtube.com/watch?v=${options.youtubeVideoId}`);
  if (
    !html.includes(options.youtubeVideoId) &&
    !html.includes(encodedWatch) &&
    !html.includes(`youtube.com/embed/${options.youtubeVideoId}`)
  ) {
    throw new Error(`${siteUrl} does not expose YouTube video ${options.youtubeVideoId}.`);
  }
}

function assertYoutubeUploadState(options: VerifyOptions, status: YoutubeVideoStatus) {
  if (!status.foundOnYoutube) {
    throw new Error("YouTube did not return a saved video record for this ID.");
  }
  if (status.uploadStatus && ["deleted", "failed", "rejected"].includes(status.uploadStatus)) {
    throw new Error(`YouTube did not save the video successfully; uploadStatus is ${status.uploadStatus}.`);
  }
  if (status.uploadStatus && !["processed", "uploaded"].includes(status.uploadStatus)) {
    throw new Error(
      `YouTube saved video uploadStatus is ${status.uploadStatus}; expected processed/uploaded.`
    );
  }
  // privacyStatus stays "private" until YouTube's own scheduler flips it
  // public at publishAt -- that's expected and not a failure on our end,
  // just confirm publishAt is actually the value we asked for. Compare as
  // parsed instants, not raw strings -- YouTube echoes publishAt back
  // without milliseconds ("...:00Z"), which never string-equals what we
  // sent ("...:00.000Z" from Date#toISOString()) even when they're the
  // exact same moment. Confirmed live 2026-07-17: this false-mismatch
  // failed verification on two real, successfully uploaded/scheduled
  // broadcasts, which then got incorrectly marked youtube_status="failed"
  // even though the upload was entirely correct.
  if (
    options.publishAt &&
    status.publishAt &&
    new Date(status.publishAt).getTime() !== new Date(options.publishAt).getTime()
  ) {
    throw new Error(
      `YouTube video publishAt is ${status.publishAt}; expected ${options.publishAt}.`
    );
  }
}

// Single-pass verification that an upload actually landed correctly: the
// rendered file is a real video, the video exists on YouTube with a healthy
// upload status and the right scheduled publish time, and the database/
// public site agree on which video is queued. Replaces the old live-phase
// polling loop -- there's nothing to wait for anymore (no RTMP connection
// to stabilize), just a one-shot confirmation with a short retry for
// transient YouTube API/indexing lag right after upload.
export async function verifyYoutubeUpload(options: VerifyOptions) {
  const startedAt = Date.now();
  const timeoutSeconds = options.timeoutSeconds ?? 120;
  const intervalSeconds = options.intervalSeconds ?? 10;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    try {
      await assertMediaGenerated(options.mediaPath);
      await assertPublicState(options);
      await assertPublicPage(options);
      const youtubeStatus = await getYoutubeStatus(options.youtubeVideoId);
      assertYoutubeUploadState(options, youtubeStatus);
      console.log(
        JSON.stringify(
          {
            ok: true,
            youtubeVideoId: options.youtubeVideoId,
            youtubeUrl: options.youtubeUrl ?? `https://www.youtube.com/watch?v=${options.youtubeVideoId}`,
            youtubeStatus
          },
          null,
          2
        )
      );
      return;
    } catch (error) {
      lastError = error;
      console.log(
        `Delivery verification waiting: ${error instanceof Error ? error.message : String(error)}`
      );
      await sleep(intervalSeconds * 1000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for YouTube upload delivery verification.");
}
