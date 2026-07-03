import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  buildHypeLineFrameFilter,
  HYPE_LINE_BACKGROUND_COLOR,
  HYPE_LINE_FRAME_HEIGHT,
  HYPE_LINE_FRAME_WIDTH,
  HYPE_LINE_LOOP_FPS,
  HYPE_LINE_LOOP_PATH,
  HYPE_LINE_LOOP_SECONDS
} from "@/lib/media/hypeLine";

const ffmpeg = process.env.FFMPEG_PATH ?? ffmpegPath ?? "ffmpeg";
const framesDir = path.resolve(".tmp/hype-line-frames");

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

async function main() {
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const totalFrames = HYPE_LINE_LOOP_SECONDS * HYPE_LINE_LOOP_FPS;
  console.log(`Rendering ${totalFrames} frames...`);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / HYPE_LINE_LOOP_FPS;
    const framePath = path.join(framesDir, `frame_${String(i).padStart(5, "0")}.png`);
    await run([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${HYPE_LINE_BACKGROUND_COLOR}:s=${HYPE_LINE_FRAME_WIDTH}x${HYPE_LINE_FRAME_HEIGHT}`,
      "-vf",
      buildHypeLineFrameFilter(t),
      "-frames:v",
      "1",
      "-update",
      "1",
      framePath
    ]);
    if (i % 60 === 0) {
      console.log(`  ${i}/${totalFrames}`);
    }
  }

  console.log("Encoding alpha-channel loop...");
  const outputPath = path.resolve(HYPE_LINE_LOOP_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  // VP9 alpha in this ffmpeg build only preserves transparency on the first
  // frame of a multi-frame encode (confirmed empirically — even two identical
  // frames decode with the second one fully opaque). The `png` codec in a mov
  // container has no such issue and stays lossless.
  await run([
    "-y",
    "-framerate",
    String(HYPE_LINE_LOOP_FPS),
    "-i",
    path.join(framesDir, "frame_%05d.png"),
    "-vf",
    `colorkey=color=${HYPE_LINE_BACKGROUND_COLOR}:similarity=0.15:blend=0,format=rgba`,
    "-c:v",
    "png",
    outputPath
  ]);

  await rm(framesDir, { recursive: true, force: true });
  console.log(`Generated hype-line loop: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
