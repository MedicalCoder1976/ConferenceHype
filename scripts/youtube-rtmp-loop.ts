import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { getFfmpegBinary } from "@/lib/media/ffmpeg";

async function main() {
  loadEnvConfig(process.cwd());
  const { getYoutubeRtmpTarget } = await import("@/lib/media/stream");
  const input = process.env.STREAM_INPUT_PATH ?? "public/rendered/fallback-loop.mp4";
  const durationSeconds = process.env.STREAM_DURATION_SECONDS ?? "3600";
  const target = getYoutubeRtmpTarget();
  const args = [
    "-re",
    "-stream_loop",
    "-1",
    "-i",
    input
  ];
  if (durationSeconds) {
    args.push("-t", durationSeconds);
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    "3500k",
    "-maxrate",
    "3500k",
    "-bufsize",
    "7000k",
    "-r",
    "30",
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-f",
    "flv",
    target
  );
  const ffmpeg = getFfmpegBinary();
  const printableArgs = args.map((arg) =>
    arg === target ? "[redacted-rtmp-target]" : arg.includes(" ") ? `"${arg}"` : arg
  );
  console.log(`${ffmpeg} ${printableArgs.join(" ")}`);
  if (process.env.STREAM_DRY_RUN === "1") {
    console.log("STREAM_DRY_RUN=1, not starting FFmpeg.");
    return;
  }
  const child = spawn(ffmpeg, args, { stdio: ["inherit", "inherit", "pipe"] });
  const stderrChunks: Buffer[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const errorLine = stderr.split("\n").find((l) => /error|failed|refused|forbidden|denied|not found/i.test(l));
      if (errorLine) console.error("ffmpeg error:", errorLine.trim());
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
