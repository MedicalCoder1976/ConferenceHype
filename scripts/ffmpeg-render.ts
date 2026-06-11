import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getApprovedSegmentsFromDb,
  getPendingSegmentsFromDb,
  getSegmentByIdFromDb
} from "@/lib/db";
import { formatVoiceSegment } from "@/lib/broadcast/voiceSegment";
import { getPersona } from "@/lib/generation/personas";
import { buildSegmentRenderCommand, runCommand } from "@/lib/media/ffmpeg";
import { synthesizeSpeech } from "@/lib/media/tts";
import type { Segment } from "@/lib/types";

async function pickSegment() {
  if (process.env.SEGMENT_ID) {
    return getSegmentByIdFromDb(process.env.SEGMENT_ID);
  }

  const approved = await getApprovedSegmentsFromDb();
  if (approved?.length) {
    return approved[0];
  }

  const pending = await getPendingSegmentsFromDb();
  if (pending?.length) {
    return pending[0];
  }

  return null;
}

function createSmokeTestSegment(): Segment {
  return {
    id: `smoke-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`,
    title: "ASCO Hype audio smoke test",
    summary: "Short render test for the Kokoro voice and FFmpeg audio pipeline.",
    script:
      "ASCO Hype audio test. This confirms the voice rendering pipeline is connected. This is not medical advice, clinical guidance, scientific validation, legal advice, or financial advice.",
    contentType: "agenda_preview",
    personaId: "echo-sage",
    personaName: "TumorCrusher",
    hypeLevel: "standard",
    language: "English",
    status: "draft",
    citations: [],
    socialBuzzItems: [],
    riskFlags: ["smoke_test"],
    confidenceScore: 100,
    createdAt: new Date().toISOString()
  };
}

async function main() {
  const segment = (await pickSegment()) ?? createSmokeTestSegment();

  const persona = getPersona(segment.personaId);
  const script = formatVoiceSegment({
    voiceName: persona.name,
    topic: segment.title,
    narrative: segment.script,
    at: new Date()
  });
  const speech = await synthesizeSpeech({
    script,
    persona
  });

  if (!speech.audioBuffer) {
    throw new Error(speech.note);
  }

  const renderDir = process.env.RENDER_DIR ?? "public/rendered";
  await mkdir(renderDir, { recursive: true });

  const safeSegmentId = segment.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const voicePath =
    process.env.VOICE_AUDIO_PATH ?? path.join(renderDir, `${safeSegmentId}-voice.mp3`);
  const musicPath =
    process.env.MUSIC_AUDIO_PATH ?? "public/music/conferencehype-gap-music-6min-v3.mp3";
  const outputPath =
    process.env.RENDER_OUTPUT_PATH ?? path.join(renderDir, `${safeSegmentId}.m4a`);

  await mkdir(path.dirname(voicePath), { recursive: true });
  await writeFile(voicePath, speech.audioBuffer);

  const withMusic = existsSync(musicPath);
  const command = buildSegmentRenderCommand({ voicePath, musicPath, outputPath, withMusic });
  console.log(
    JSON.stringify(
      {
        segmentId: segment.id,
        title: segment.title,
        persona: persona.name,
        provider: speech.provider,
        voicePath,
        outputPath,
        withMusic,
        note: withMusic
          ? "Rendering voice with music bed."
          : "Music bed not found; rendering voice-only audio."
      },
      null,
      2
    )
  );
  console.log(command.join(" "));
  await runCommand(command);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
