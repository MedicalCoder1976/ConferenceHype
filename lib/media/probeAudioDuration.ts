import path from "node:path";
import { spawn } from "node:child_process";

// No ffprobe binary is guaranteed to be on PATH (ffmpeg-static ships only
// ffmpeg locally; CI installs the apt "ffmpeg" package, which does bundle
// ffprobe, but nothing here should depend on that). Decoding with
// "-f null -" and reading the last "time=" progress line gives the real
// decoded length from the same ffmpeg binary already used everywhere else,
// rather than trusting a container's "Duration:" header, which can be a
// bitrate-based estimate for some MP3 encoders. Shared by
// scripts/render-hour-broadcast.ts and scripts/dub-korean-broadcast.ts.
export function probeAudioDurationSeconds(ffmpeg: string, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-i", filePath, "-f", "null", "-"]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", () => {
      const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
      const last = matches[matches.length - 1];
      if (!last) {
        reject(new Error(`Could not determine audio duration for ${path.basename(filePath)}`));
        return;
      }
      const [, hh, mm, ss] = last;
      resolve(Number(hh) * 3600 + Number(mm) * 60 + Number(ss));
    });
  });
}
