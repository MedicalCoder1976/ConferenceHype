import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type GapMusicClip = {
  id: string;
  title: string;
  sourceTrack: string;
  nextSpeaker: string;
  nextRole: string;
  durationSeconds: number;
  audioPath: string;
  introText: string;
};

type GapMusicManifest = {
  generatedAt: string;
  licenseNote: string;
  rotationRule: string;
  clips: GapMusicClip[];
};

export async function getGapMusicManifest() {
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "music",
    "gap-clips",
    "manifest.json"
  );

  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as GapMusicManifest;
  } catch {
    return null;
  }
}

export async function pickGapMusicForNextSpeaker(nextSpeaker?: string) {
  const manifest = await getGapMusicManifest();
  if (!manifest?.clips.length) {
    return null;
  }
  if (nextSpeaker) {
    const matched = manifest.clips.find(
      (clip) => clip.nextSpeaker.toLowerCase() === nextSpeaker.toLowerCase()
    );
    if (matched) {
      return matched;
    }
  }
  return manifest.clips[0];
}
