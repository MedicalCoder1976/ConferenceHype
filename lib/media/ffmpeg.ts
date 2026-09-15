import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

export function getFfmpegBinary() {
  return process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";
}

export function buildSegmentRenderCommand({ voicePath, outputPath }: {
  voicePath: string; outputPath: string; musicPath?: string; withMusic?: boolean;
}) {
  // Narration-only applies even to callers carrying legacy music options.
  return [getFfmpegBinary(), "-y", "-i", voicePath, "-c:a", "aac", "-b:a", "128k", outputPath];
}

export function buildNarrationAudioArgs(entries: Array<{path: string; startMs: number; durationMs: number}>) {
  if (!entries.length) throw new Error("Narration audio is required; music and silent fallbacks are disabled.");
  for (const entry of entries) {
    if (!entry.path || !Number.isFinite(entry.startMs) || entry.startMs < 0 || !Number.isFinite(entry.durationMs) || entry.durationMs <= 0) throw new Error("Invalid narration window.");
  }
  const filters = entries.map((entry, i) =>
    `[${i + 1}:a]volume=0.85,atrim=0:${(entry.durationMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(entry.startMs)}|${Math.round(entry.startMs)}[v${i}]`
  );
  filters.push(`${entries.map((_, i) => `[v${i}]`).join("")}amix=inputs=${entries.length}:duration=longest:normalize=0[a]`);
  return [...entries.flatMap(entry => ["-i", entry.path]), "-filter_complex", filters.join(";")];
}

export function runCommand(command: string[]) {
  return new Promise<void>((resolve, reject) => {
    const [bin, ...args] = command;
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${bin} exited with code ${code}`));
      }
    });
  });
}
