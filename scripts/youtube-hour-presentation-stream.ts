import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { loadEnvConfig } from "@next/env";
import { updateConferenceCoverageDeliveryInDb } from "@/lib/db";
import { HYPE_LINE_VIDEO_FILTER, HYPE_LINE_VIDEO_INPUT } from "@/lib/media/hypeLine";
import { verifyYoutubeDeliveryLoop } from "@/lib/media/youtubeDeliveryVerifier";

loadEnvConfig(process.cwd());

const ffmpeg = process.env.FFMPEG_PATH ?? ffmpegPath ?? "ffmpeg";
const videoPath = process.env.STREAM_VIDEO_PATH;
const musicPath =
  process.env.STREAM_MUSIC_PATH ?? "public/music/conferencehype-gap-music-6min-v3.mp3";
const voicePath = process.env.STREAM_VOICE_PATH;
const durationSeconds = process.env.STREAM_DURATION_SECONDS ?? "3600";
const coverageSlotId = process.env.COVERAGE_SLOT_ID;

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

  const videoInputArgs = ["-re", "-f", "lavfi", "-i", HYPE_LINE_VIDEO_INPUT];
  const liveAudioArgs = videoPath
    ? ["-stream_loop", "-1", "-i", videoPath, "-map", "1:a:0"]
    : voicePath
      ? [
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-stream_loop",
        "-1",
        "-i",
        voicePath,
        "-filter_complex",
        "[1:a]volume=0.18[music];[2:a]volume=0.85[voice];[music][voice]amix=inputs=2:duration=longest:dropout_transition=0[a]",
        "-map",
        "[a]"
      ]
      : [
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        "[1:a]volume=0.18[a]",
        "-map",
        "[a]"
      ];

  const args = [
    ...videoInputArgs,
    "-map",
    "0:v:0",
    ...liveAudioArgs,
    "-t",
    durationSeconds,
    "-vf",
    HYPE_LINE_VIDEO_FILTER,
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
