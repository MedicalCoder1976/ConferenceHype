import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

type Phase = "live" | "completed";

type VerifyOptions = {
  phase: Phase;
  youtubeVideoId: string;
  youtubeUrl?: string;
  mediaPath?: string;
  siteUrl?: string;
  timeoutSeconds?: number;
  intervalSeconds?: number;
};

type YoutubeBroadcastStatus = {
  foundOnYoutube: boolean;
  watchPageReachable: boolean;
  lifeCycleStatus?: string;
  privacyStatus?: string;
  recordingStatus?: string;
  uploadStatus?: string;
  actualStartTime?: string;
  actualEndTime?: string;
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

async function assertMediaGenerated(mediaPath?: string) {
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

async function getYoutubeStatus(videoId: string): Promise<YoutubeBroadcastStatus> {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) {
    await assertYoutubeWatchPage(videoId);
    return { foundOnYoutube: true, watchPageReachable: true };
  }

  const [broadcastResponse, videoResponse] = await Promise.all([
    fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status,contentDetails&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
    fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  ]);
  if (!broadcastResponse.ok) {
    throw new Error(`YouTube broadcast lookup failed: ${broadcastResponse.status} ${await broadcastResponse.text()}`);
  }
  if (!videoResponse.ok) {
    throw new Error(`YouTube video lookup failed: ${videoResponse.status} ${await videoResponse.text()}`);
  }
  const broadcastPayload = (await broadcastResponse.json()) as {
    items?: Array<{
      status?: {
        lifeCycleStatus?: string;
        privacyStatus?: string;
        recordingStatus?: string;
      };
      contentDetails?: { enableEmbed?: boolean };
    }>;
  };
  const videoPayload = (await videoResponse.json()) as {
    items?: Array<{
      status?: { uploadStatus?: string; embeddable?: boolean };
      liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
    }>;
  };
  const broadcast = broadcastPayload.items?.[0];
  const video = videoPayload.items?.[0];
  if (!video) {
    throw new Error(`YouTube video ${videoId} was not found.`);
  }
  await assertYoutubeWatchPage(videoId);
  return {
    foundOnYoutube: true,
    watchPageReachable: true,
    lifeCycleStatus: broadcast?.status?.lifeCycleStatus,
    privacyStatus: broadcast?.status?.privacyStatus,
    recordingStatus: broadcast?.status?.recordingStatus,
    uploadStatus: video.status?.uploadStatus,
    actualStartTime: video.liveStreamingDetails?.actualStartTime,
    actualEndTime: video.liveStreamingDetails?.actualEndTime,
    embeddable: video.status?.embeddable ?? broadcast?.contentDetails?.enableEmbed
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
  if (streamState?.youtube_status !== options.phase) {
    throw new Error(`Public stream_state is ${streamState?.youtube_status}; expected ${options.phase}.`);
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

function assertYoutubePhase(phase: Phase, status: YoutubeBroadcastStatus) {
  if (!status.foundOnYoutube || !status.watchPageReachable) {
    throw new Error("YouTube did not return a saved/reachable video record for this ID.");
  }

  if (phase === "live") {
    if (status.lifeCycleStatus && !["live", "testing"].includes(status.lifeCycleStatus)) {
      throw new Error(`YouTube broadcast is ${status.lifeCycleStatus}; expected live/testing.`);
    }
    if (status.actualEndTime) {
      throw new Error("YouTube video already has an end time while live verification is running.");
    }
    return;
  }

  if (status.lifeCycleStatus && status.lifeCycleStatus !== "complete") {
    throw new Error(`YouTube broadcast is ${status.lifeCycleStatus}; expected complete.`);
  }
  if (
    status.uploadStatus &&
    !["processed", "uploaded"].includes(status.uploadStatus)
  ) {
    throw new Error(
      `YouTube saved video uploadStatus is ${status.uploadStatus}; expected processed/uploaded.`
    );
  }
  if (status.uploadStatus && ["deleted", "failed", "rejected"].includes(status.uploadStatus)) {
    throw new Error(`YouTube did not save the video successfully; uploadStatus is ${status.uploadStatus}.`);
  }
}

export async function verifyYoutubeDeliveryLoop(options: VerifyOptions) {
  const startedAt = Date.now();
  const timeoutSeconds = options.timeoutSeconds ?? (options.phase === "completed" ? 900 : 180);
  const intervalSeconds = options.intervalSeconds ?? 15;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    try {
      await assertMediaGenerated(options.mediaPath);
      await assertPublicState(options);
      await assertPublicPage(options);
      const youtubeStatus = await getYoutubeStatus(options.youtubeVideoId);
      assertYoutubePhase(options.phase, youtubeStatus);
      console.log(
        JSON.stringify(
          {
            ok: true,
            phase: options.phase,
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
        `Delivery verification waiting for ${options.phase}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(intervalSeconds * 1000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${options.phase} YouTube delivery verification.`);
}
