import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type CachedRecording = {
  id: string;
  title: string;
  personaName: string;
  voiceName: string;
  voiceId: string;
  provider: string;
  durationSeconds: number;
  audioPath: string;
  scriptPath: string;
  generatedAt: string;
  reuseCommand: string;
  notes: string;
};

type RecordingManifest = {
  recordings: CachedRecording[];
};

export async function getCachedRecordings() {
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "rendered",
    "recordings",
    "manifest.json"
  );

  try {
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as RecordingManifest;
    return manifest.recordings;
  } catch {
    return [];
  }
}
