import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { loadEnvConfig } from "@next/env";
import { updateConferenceCoverageDeliveryInDb } from "@/lib/db";
import {
  HYPE_LINE_BACKGROUND_COLOR,
  HYPE_LINE_FRAME_HEIGHT,
  HYPE_LINE_FRAME_WIDTH,
  HYPE_LINE_LOOP_PATH
} from "@/lib/media/hypeLine";
import { verifyYoutubeDeliveryLoop } from "@/lib/media/youtubeDeliveryVerifier";

loadEnvConfig(process.cwd());

const ffmpeg = process.env.FFMPEG_PATH ?? ffmpegPath ?? "ffmpeg";
const videoPath = process.env.STREAM_VIDEO_PATH;
const musicPath =
  process.env.STREAM_MUSIC_PATH ?? "public/music/conferencehype-gap-music-6min-v5.mp3";
const voicePath = process.env.STREAM_VOICE_PATH;
const durationSeconds = process.env.STREAM_DURATION_SECONDS ?? "3600";
const coverageSlotId = process.env.COVERAGE_SLOT_ID;

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
    console.error(`YOUTUBE_OAUTH_REFRESH_ERROR: ${tokenResponse.status} ${await tokenResponse.text()}`);
    return undefined;
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  return tokenPayload.access_token;
}

// The RTMP feed dropping only tells YouTube the stream is unhealthy; YouTube
// then waits on its own schedule (which can run well past our stream-end
// verification window) before it auto-transitions the broadcast to
// "complete". Ending it explicitly here keeps YouTube's lifeCycleStatus in
// sync with the moment we mark delivery complete in the database, instead of
// leaving a window where the site says "completed" while YouTube still shows
// the video as live.
async function endYoutubeBroadcast(videoId: string) {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) {
    return;
  }
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&part=status&id=${encodeURIComponent(videoId)}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    console.error(`YOUTUBE_BROADCAST_TRANSITION_FAILED: ${response.status} ${await response.text()}`);
  }
}

async function updateDelivery(
  youtubeStatus: "live" | "completed" | "failed",
  deliveryError?: string
) {
  try {
    await updateConferenceCoverageDeliveryInDb(coverageSlotId, {
      youtubeStatus,
      youtubeVideoId: process.env.YOUTUBE_VIDEO_ID,
      youtubeUrl: process.env.YOUTUBE_VIDEO_URL,
      workflowRunId: process.env.GITHUB_RUN_ID,
      workflowUrl:
        process.env.GITHUB_SERVER_URL &&
        process.env.GITHUB_REPOSITORY &&
        process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : undefined,
      streamStartedAt: youtubeStatus === "live" ? new Date().toISOString() : undefined,
      streamEndedAt:
        youtubeStatus === "completed" || youtubeStatus === "failed"
          ? new Date().toISOString()
          : undefined,
      deliveryError: deliveryError ?? null
    });
  } catch (error) {
    console.error(`YOUTUBE_DELIVERY_UPDATE_ERROR: ${String(error)}`);
  }
}
async function main() {
  const { getYoutubeRtmpTarget } = await import("@/lib/media/stream");
  const target = getYoutubeRtmpTarget();

  // When a pre-rendered video is supplied, it already has real card visuals
  // and the hype-line bars baked in (see render-hour-broadcast.ts) -- restream
  // its own video+audio directly. Only fall back to the blank-canvas +
  // hype-line-bars composite when there is no rendered video at all (the
  // music/voice-only path), since in that case there is no real video track
  // to show.
  const videoInputArgs = videoPath
    ? []
    : [
        "-re",
        "-f",
        "lavfi",
        "-i",
        `color=c=${HYPE_LINE_BACKGROUND_COLOR}:s=${HYPE_LINE_FRAME_WIDTH}x${HYPE_LINE_FRAME_HEIGHT}:r=30`
      ];
  const liveAudio = videoPath
    ? {
        // -re paces this input to real-time playback speed; previously that
        // pacing came from the (now-removed) blank-canvas lavfi input, so it
        // must live here instead or the stream reads/pushes the whole file
        // as fast as disk I/O allows instead of at real-time.
        inputArgs: ["-re", "-stream_loop", "-1", "-i", videoPath],
        audioFilter: undefined as string | undefined,
        mapArgs: ["-map", "0:v:0", "-map", "0:a:0"]
      }
    : voicePath
      ? {
        inputArgs: [
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-stream_loop",
        "-1",
        "-i",
        voicePath
        ],
        audioFilter:
          "[1:a]volume=0.18[music];[2:a]volume=0.85[voice];[music][voice]amix=inputs=2:duration=longest:dropout_transition=0[a]",
        mapArgs: [
        "-map",
        "[a]"
        ]
      }
      : {
        inputArgs: [
        "-stream_loop",
        "-1",
        "-i",
        musicPath
        ],
        audioFilter: "[1:a]volume=0.18[a]",
        mapArgs: [
        "-map",
        "[a]"
        ]
      };

  // Bars loop is appended as the last input so it doesn't shift the numeric
  // audio input indices ("1:a:0" etc.) referenced above. Not needed at all
  // when streaming a pre-rendered video, since the bars are already baked in.
  const hypeLineLoopInputIndex = 1 + liveAudio.inputArgs.filter((arg) => arg === "-i").length;
  const hypeLineLoopInputArgs = videoPath
    ? []
    : ["-stream_loop", "-1", "-i", path.resolve(HYPE_LINE_LOOP_PATH)];
  const videoOverlayFilter = `[0:v][${hypeLineLoopInputIndex}:v]overlay=0:0[vout]`;
  const filterComplex = videoPath
    ? undefined
    : liveAudio.audioFilter
      ? `${liveAudio.audioFilter};${videoOverlayFilter}`
      : videoOverlayFilter;

  const args = [
    ...videoInputArgs,
    ...liveAudio.inputArgs,
    ...hypeLineLoopInputArgs,
    ...(filterComplex ? ["-filter_complex", filterComplex] : []),
    ...(filterComplex ? ["-map", "[vout]"] : []),
    ...liveAudio.mapArgs,
    "-t",
    durationSeconds,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*2)",
    "-b:v",
    "3500k",
    "-maxrate",
    "3500k",
    "-bufsize",
    "7000k",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-f",
    "flv",
    target
  ];

  console.log(
    `${ffmpeg} ${args
      .map((arg) => (arg === target ? "[redacted-rtmp-target]" : arg))
      .join(" ")}`
  );
  if (process.env.STREAM_DRY_RUN === "1") {
    console.log("STREAM_DRY_RUN=1, not starting FFmpeg.");
    return;
  }

  const startedAt = Date.now();
  const child = spawn(ffmpeg, args, { stdio: ["inherit", "inherit", "pipe"] });
  let stderr = "";
  let stable = false;
  const stabilityTimer = setTimeout(() => {
    stable = true;
    void (async () => {
      console.log("YOUTUBE_RTMP_STABLE: FFmpeg remained connected for 30 seconds.");
      await updateDelivery("live");
      if (process.env.YOUTUBE_SKIP_LIVE_VERIFY === "1" || !process.env.YOUTUBE_VIDEO_ID) {
        return;
      }
      try {
        await verifyYoutubeDeliveryLoop({
          phase: "live",
          youtubeVideoId: process.env.YOUTUBE_VIDEO_ID,
          youtubeUrl: process.env.YOUTUBE_VIDEO_URL,
          mediaPath: videoPath,
          timeoutSeconds: Number(process.env.YOUTUBE_LIVE_VERIFY_TIMEOUT_SECONDS ?? "180"),
          intervalSeconds: Number(process.env.YOUTUBE_LIVE_VERIFY_INTERVAL_SECONDS ?? "15")
        });
        console.log("YOUTUBE_LIVE_DELIVERY_VERIFIED: rendered video, YouTube, public state, and conferencehype.com match.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`YOUTUBE_LIVE_DELIVERY_VERIFY_FAILED: ${message}`);
        await updateDelivery("failed", message);
        child.kill("SIGTERM");
      }
    })();
  }, 30_000);
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderr = `${stderr}${text}`.slice(-32_000);
    process.stderr.write(chunk);
  });
  child.on("error", (error) => {
    clearTimeout(stabilityTimer);
    console.error(`YOUTUBE_RTMP_SPAWN_ERROR: ${error.message}`);
    void updateDelivery("failed", error.message);
  });
  child.on("exit", async (code) => {
    clearTimeout(stabilityTimer);
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (
      process.env.STREAM_DRY_RUN !== "1" &&
      process.env.STREAM_ALLOW_SHORT_EXIT !== "1" &&
      elapsedSeconds < 15
    ) {
      console.error(
        `FFmpeg exited after ${elapsedSeconds.toFixed(
          1
        )}s before the YouTube stream could stabilize.`
      );
      process.exit(1);
    }
    if (!stable && code !== 0) {
      const errorLine = stderr
        .split("\n")
        .find((line) =>
          /error|failed|refused|forbidden|denied|unauthorized|broken pipe/i.test(line)
        );
      if (errorLine) {
        console.error(`YOUTUBE_RTMP_ERROR: ${errorLine.trim()}`);
      }
    }
    if (process.env.YOUTUBE_VIDEO_ID) {
      await endYoutubeBroadcast(process.env.YOUTUBE_VIDEO_ID);
    }
    await updateDelivery(
      code === 0 ? "completed" : "failed",
      code === 0 ? undefined : `FFmpeg exited with code ${code ?? "unknown"}.`
    );
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
