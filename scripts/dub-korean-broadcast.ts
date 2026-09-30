import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  getBroadcastWriteoutByIdFromDb,
  updateBroadcastWriteoutKoreanDubInDb
} from "@/lib/db";
import { buildEvidenceDashboardSvg } from "@/lib/broadcast/evidenceDashboard";
import { OPERATOR_MUSIC_TRACKS } from "@/lib/broadcast/operatorMusic";
import { synthesizeKoreanSpeech } from "@/lib/media/tts";
import { translateToKorean } from "@/lib/media/translateToKorean";
import { probeAudioDurationSeconds } from "@/lib/media/probeAudioDuration";
import { getYoutubeAccessToken, uploadVideoToYoutube } from "@/lib/youtube/uploadBroadcastVideo";
import type { BroadcastWriteoutCard } from "@/lib/types";

loadEnvConfig(process.cwd());

// Audio-only Korean dub (conferencehype.com/admin "Dub to Korean" button):
// on-screen dashboard graphics stay in English (operator's explicit choice),
// only the spoken narration is translated and re-synthesized. Because the
// Korean translation of a card never runs the same length as the English
// original, this re-renders a full new video timed to the real Korean clip
// durations, rather than trying to remux new audio onto the existing
// English video (which would either cut off or leave dead air).
const TRANSITION_SECONDS = 4;

const renderDir = process.env.KOREAN_DUB_DIR ?? "public/rendered/korean-dub";
const outputPath =
  process.env.KOREAN_DUB_OUTPUT ?? "public/rendered/conferencehype-korean-dub.mp4";
const ffmpeg = process.env.FFMPEG_PATH ?? (ffmpegPath as unknown as string) ?? "ffmpeg";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const writeoutId = process.env.BROADCAST_WRITEOUT_ID;
  if (!writeoutId) {
    throw new Error("BROADCAST_WRITEOUT_ID is required.");
  }

  const writeout = await getBroadcastWriteoutByIdFromDb(writeoutId);
  if (!writeout) {
    throw new Error(`No broadcast_writeouts row found for id ${writeoutId}.`);
  }
  if (!writeout.youtubeVideoId || !writeout.youtubeUrl) {
    throw new Error(`Writeout ${writeoutId} has no English YouTube video to dub from.`);
  }
  const contentCards = writeout.cards.filter(
    (card): card is BroadcastWriteoutCard & { script: string } =>
      card.kind === "content" && Boolean(card.script?.trim())
  );
  if (contentCards.length === 0) {
    throw new Error(`Writeout ${writeoutId} has no spoken content cards to translate.`);
  }

  await updateBroadcastWriteoutKoreanDubInDb(writeoutId, { koreanDubStatus: "processing" });

  try {
    await mkdir(renderDir, { recursive: true });

    type RenderedCard = { imagePath: string; durationSeconds: number };
    const audioConcatLines: string[] = [];
    const videoConcatLines: string[] = [];
    let previousTitle: string | undefined;

    for (let index = 0; index < contentCards.length; index += 1) {
      const card = contentCards[index];
      console.log(`[${index + 1}/${contentCards.length}] Translating: ${card.title}`);
      const koreanScript = await translateToKorean(card.script);

      const voiceResult = await synthesizeKoreanSpeech({ script: koreanScript });
      if (voiceResult.provider === "skipped") {
        throw new Error(voiceResult.note);
      }
      const voicePath = path.join(renderDir, `voice-${String(index + 1).padStart(2, "0")}.mp3`);
      await writeFile(voicePath, voiceResult.audioBuffer);
      const voiceSeconds = await probeAudioDurationSeconds(ffmpeg, voicePath);

      // On-screen text stays in English -- only the narration is dubbed.
      const imagePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
      const svg = buildEvidenceDashboardSvg({
        title: card.title,
        previousTitle,
        text: card.script,
        sourceLabel: card.sourceLabel,
        contentType: card.contentType,
        isMusic: false,
        seriesHeadline: "Clinical Evidence Brief",
        index,
        total: contentCards.length
      });
      await sharp(Buffer.from(svg)).png().toFile(imagePath);
      previousTitle = card.title;

      videoConcatLines.push(`file '${path.resolve(imagePath).replace(/\\/g, "/")}'`, `duration ${voiceSeconds}`);
      audioConcatLines.push(`file '${path.resolve(voicePath).replace(/\\/g, "/")}'`);

      const isLastCard = index === contentCards.length - 1;
      if (!isLastCard) {
        const track = OPERATOR_MUSIC_TRACKS[index % OPERATOR_MUSIC_TRACKS.length];
        const trimmedGapPath = path.join(renderDir, `gap-${String(index + 1).padStart(2, "0")}.mp3`);
        await run(ffmpeg, [
          "-y",
          "-i",
          path.resolve(track.publicPath.replace(/^\//, "")),
          "-t",
          String(TRANSITION_SECONDS),
          trimmedGapPath
        ]);
        // Hold the just-finished card's visual through the brief transition
        // beat -- the writeout doesn't persist which exact gap-clip visual
        // the English render used, so there's nothing authentic to replay.
        videoConcatLines.push(`file '${path.resolve(imagePath).replace(/\\/g, "/")}'`, `duration ${TRANSITION_SECONDS}`);
        audioConcatLines.push(`file '${path.resolve(trimmedGapPath).replace(/\\/g, "/")}'`);
      }
    }
    // ffconcat needs the final image repeated without a trailing duration.
    const lastImage = path
      .resolve(renderDir, `slide-${String(contentCards.length).padStart(2, "0")}.png`)
      .replace(/\\/g, "/");
    videoConcatLines.push(`file '${lastImage}'`);

    const videoConcatPath = path.join(renderDir, "slides.ffconcat");
    const audioConcatPath = path.join(renderDir, "audio.ffconcat");
    await writeFile(videoConcatPath, videoConcatLines.join("\n"), "utf8");
    await writeFile(audioConcatPath, audioConcatLines.join("\n"), "utf8");

    console.log("Encoding final Korean-dub video...");
    await run(ffmpeg, [
      "-y",
      "-f", "concat", "-safe", "0", "-i", videoConcatPath,
      "-f", "concat", "-safe", "0", "-i", audioConcatPath,
      "-map", "0:v", "-map", "1:a",
      "-r", "30",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-shortest",
      outputPath
    ]);

    console.log("Uploading Korean dub to YouTube...");
    const accessToken = await getYoutubeAccessToken();
    const koreanTitle = `${writeout.title} [한국어 더빙]`;
    const koreanDescription = `Korean-language audio dub of our English broadcast: ${writeout.youtubeUrl}\n\nOn-screen graphics remain in English; narration is dubbed in Korean.`;
    const uploaded = await uploadVideoToYoutube({
      filePath: outputPath,
      accessToken,
      title: koreanTitle,
      description: koreanDescription,
      tags: [],
      categoryId: "27"
    });
    const koreanYoutubeUrl = `https://www.youtube.com/watch?v=${uploaded.id}`;
    console.log(`Uploaded Korean dub: ${koreanYoutubeUrl}`);

    await updateBroadcastWriteoutKoreanDubInDb(writeoutId, {
      koreanDubStatus: "done",
      koreanYoutubeVideoId: uploaded.id,
      koreanYoutubeUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateBroadcastWriteoutKoreanDubInDb(writeoutId, {
      koreanDubStatus: "failed",
      koreanDubError: message
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
