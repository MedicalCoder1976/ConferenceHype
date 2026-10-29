import { mkdir, writeFile } from "node:fs/promises";
import { defaultRenderPath } from "@/lib/media/localOutputDir";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import ffmpegPath from "ffmpeg-static";
import OpenAI from "openai";
import sharp from "sharp";
import {
  getBroadcastWriteoutByIdFromDb,
  updateBroadcastWriteoutKoreanDubInDb
} from "@/lib/db";
import { env } from "@/lib/env";
import { buildEvidenceDashboardSvg } from "@/lib/broadcast/evidenceDashboard";
import { OPERATOR_MUSIC_TRACKS } from "@/lib/broadcast/operatorMusic";
import { synthesizeKoreanSpeech } from "@/lib/media/tts";
import { translateToKorean } from "@/lib/media/translateToKorean";
import { probeAudioDurationSeconds } from "@/lib/media/probeAudioDuration";
import { createAdminClient } from "@/lib/supabase/admin";
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
//
// Two sources (2026-10-28): an hourly broadcast_writeouts row
// (BROADCAST_WRITEOUT_ID) or a Story / Meeting Watch video
// (MEETING_WATCH_BROADCAST_ID), whose cards are the segments in card_ids.
//
// Voice: KOREAN_TTS_PROVIDER=melo (default) uses free, open-source MeloTTS via
// scripts/generate-melo-korean-voice.py; =openai uses OpenAI TTS and needs
// OPENAI_API_KEY. DUB_TEST_CARDS=N renders only the first N cards and skips
// the YouTube upload, so the voice can be checked before a real release.
const TRANSITION_SECONDS = 4;
const YOUTUBE_TITLE_LIMIT = 100;
const KOREAN_SUFFIX = " [한국어 더빙]";

const renderDir = process.env.KOREAN_DUB_DIR ?? defaultRenderPath("korean-dub");
const outputPath =
  process.env.KOREAN_DUB_OUTPUT ?? defaultRenderPath("conferencehype-korean-dub.mp4");
const ffmpeg = process.env.FFMPEG_PATH ?? (ffmpegPath as unknown as string) ?? "ffmpeg";
const provider = (process.env.KOREAN_TTS_PROVIDER ?? "melo").toLowerCase();
const pythonCmd = process.env.MELO_PYTHON_CMD ?? "python3";
const testCards = Number(process.env.DUB_TEST_CARDS ?? "0");

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

type DubCard = { title: string; script: string; sourceLabel?: string; contentType?: BroadcastWriteoutCard["contentType"] };
type DubSource = {
  title: string;
  youtubeUrl: string;
  cards: DubCard[];
  // Only writeouts have the korean_dub_* columns to report progress into.
  report?: (patch: Parameters<typeof updateBroadcastWriteoutKoreanDubInDb>[1]) => Promise<unknown>;
};

async function loadWriteoutSource(writeoutId: string): Promise<DubSource> {
  const writeout = await getBroadcastWriteoutByIdFromDb(writeoutId);
  if (!writeout) {
    throw new Error(`No broadcast_writeouts row found for id ${writeoutId}.`);
  }
  if (!writeout.youtubeVideoId || !writeout.youtubeUrl) {
    throw new Error(`Writeout ${writeoutId} has no English YouTube video to dub from.`);
  }
  const cards = writeout.cards
    .filter((card): card is BroadcastWriteoutCard & { script: string } => card.kind === "content" && Boolean(card.script?.trim()))
    .map((card) => ({ title: card.title, script: card.script, sourceLabel: card.sourceLabel, contentType: card.contentType }));
  return {
    title: writeout.title,
    youtubeUrl: writeout.youtubeUrl,
    cards,
    report: (patch) => updateBroadcastWriteoutKoreanDubInDb(writeoutId, patch)
  };
}

async function loadStorySource(broadcastId: string): Promise<DubSource> {
  const supabase = createAdminClient();
  const { data: broadcast, error } = await supabase
    .from("meeting_watch_broadcasts")
    .select("title,youtube_url,card_ids,status")
    .eq("id", broadcastId)
    .maybeSingle();
  if (error) throw new Error(`Could not load broadcast ${broadcastId}: ${error.message}`);
  if (!broadcast) throw new Error(`No meeting_watch_broadcasts row found for id ${broadcastId}.`);
  if (!broadcast.youtube_url) throw new Error(`Broadcast ${broadcastId} has no English YouTube video to dub from.`);
  const ids = (broadcast.card_ids ?? []) as string[];
  const { data: segments, error: segmentError } = await supabase
    .from("segments")
    .select("id,title,script,content_type")
    .in("id", ids);
  if (segmentError) throw new Error(`Could not load cards for ${broadcastId}: ${segmentError.message}`);
  const byId = new Map((segments ?? []).map((segment) => [segment.id as string, segment]));
  // card_ids is the spoken order.
  const cards = ids
    .map((id) => byId.get(id))
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment?.script?.trim()))
    .map((segment) => ({ title: segment.title as string, script: segment.script as string, contentType: segment.content_type }));
  return { title: broadcast.title as string, youtubeUrl: broadcast.youtube_url as string, cards };
}

// A Korean headline helps Korean-language search; the English title plus the
// suffix usually runs past YouTube's 100 characters.
async function koreanTitleFor(englishTitle: string) {
  const room = YOUTUBE_TITLE_LIMIT - KOREAN_SUFFIX.length;
  if (env.LLM_API_KEY) {
    const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
    const response = await client.chat.completions.create({
      model: env.LLM_MODEL,
      messages: [
        {
          role: "user",
          content: `Translate this YouTube video title into natural Korean for Korean medical viewers. Keep company, drug and trial names in the form Korean medical media use (keep the English brand if there is no established Korean form). Keep any "<Meeting> <Year> Update <N>:" label at the start, translated naturally. At most ${room} characters. Return only the title.\n\n${englishTitle}`
        }
      ],
      temperature: 0.2
    });
    const translated = response.choices[0]?.message.content?.trim().replace(/^["']|["']$/g, "");
    if (translated && translated.length <= room) return `${translated}${KOREAN_SUFFIX}`;
  }
  const clipped = englishTitle.length <= room ? englishTitle : englishTitle.slice(0, englishTitle.lastIndexOf(" ", room)).trim();
  return `${clipped}${KOREAN_SUFFIX}`;
}

async function synthesizeAll(scripts: string[]) {
  const wavPaths = scripts.map((_, index) => path.join(renderDir, `voice-${String(index + 1).padStart(2, "0")}.wav`));
  if (provider === "openai") {
    for (let index = 0; index < scripts.length; index += 1) {
      const result = await synthesizeKoreanSpeech({ script: scripts[index] });
      if (result.provider === "skipped") throw new Error(result.note);
      const mp3 = wavPaths[index].replace(/\.wav$/, ".mp3");
      await writeFile(mp3, result.audioBuffer);
      wavPaths[index] = mp3;
    }
    return wavPaths;
  }
  const manifestPath = path.join(renderDir, "melo-manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(scripts.map((text, index) => ({ text, out: path.resolve(wavPaths[index]) }))),
    "utf8"
  );
  await run(pythonCmd, [path.resolve("scripts/generate-melo-korean-voice.py"), manifestPath]);
  return wavPaths;
}

async function main() {
  const writeoutId = process.env.BROADCAST_WRITEOUT_ID;
  const storyId = process.env.MEETING_WATCH_BROADCAST_ID;
  if (!writeoutId && !storyId) {
    throw new Error("Set BROADCAST_WRITEOUT_ID or MEETING_WATCH_BROADCAST_ID.");
  }
  const source = storyId ? await loadStorySource(storyId) : await loadWriteoutSource(writeoutId as string);
  const contentCards = testCards > 0 ? source.cards.slice(0, testCards) : source.cards;
  if (contentCards.length === 0) {
    throw new Error(`${source.title} has no spoken content cards to translate.`);
  }

  await source.report?.({ koreanDubStatus: "processing" });

  try {
    await mkdir(renderDir, { recursive: true });

    const koreanScripts: string[] = [];
    for (let index = 0; index < contentCards.length; index += 1) {
      console.log(`[${index + 1}/${contentCards.length}] Translating: ${contentCards[index].title}`);
      koreanScripts.push(await translateToKorean(contentCards[index].script, { spellNumbers: provider !== "openai" }));
    }
    await writeFile(
      path.join(renderDir, "korean-scripts.json"),
      JSON.stringify(contentCards.map((card, index) => ({ title: card.title, english: card.script, korean: koreanScripts[index] })), null, 2),
      "utf8"
    );

    console.log(`Synthesizing Korean narration with ${provider === "openai" ? "OpenAI TTS" : "MeloTTS"}...`);
    const voicePaths = await synthesizeAll(koreanScripts);

    const audioConcatLines: string[] = [];
    const videoConcatLines: string[] = [];
    let previousTitle: string | undefined;

    for (let index = 0; index < contentCards.length; index += 1) {
      const card = contentCards[index];
      const voicePath = voicePaths[index];
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
        seriesHeadline: storyId ? source.title : "Clinical Evidence Brief",
        index,
        total: contentCards.length
      });
      await sharp(Buffer.from(svg)).png().toFile(imagePath);
      previousTitle = card.title;

      // Re-encode every clip to one format so the concat demuxer can join
      // MeloTTS wav clips and mp3 music beds.
      const clipPath = path.join(renderDir, `clip-${String(index + 1).padStart(2, "0")}.m4a`);
      await run(ffmpeg, ["-y", "-i", voicePath, "-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "160k", clipPath]);

      videoConcatLines.push(`file '${path.resolve(imagePath).replace(/\\/g, "/")}'`, `duration ${voiceSeconds}`);
      audioConcatLines.push(`file '${path.resolve(clipPath).replace(/\\/g, "/")}'`);

      const isLastCard = index === contentCards.length - 1;
      if (!isLastCard) {
        const track = OPERATOR_MUSIC_TRACKS[index % OPERATOR_MUSIC_TRACKS.length];
        const trimmedGapPath = path.join(renderDir, `gap-${String(index + 1).padStart(2, "0")}.m4a`);
        await run(ffmpeg, [
          "-y",
          "-i",
          // publicPath is a site URL ("/music/..."); the file lives under public/.
          path.resolve("public", track.publicPath.replace(/^\//, "")),
          "-t",
          String(TRANSITION_SECONDS),
          "-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "160k",
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

    if (testCards > 0) {
      console.log(`Test render of ${contentCards.length} card(s) written to ${outputPath}; not uploaded.`);
      return;
    }

    console.log("Uploading Korean dub to YouTube...");
    const accessToken = await getYoutubeAccessToken();
    const koreanTitle = await koreanTitleFor(source.title);
    const koreanDescription = `Korean-language audio dub of our English broadcast: ${source.youtubeUrl}\n\nOn-screen graphics remain in English; narration is dubbed in Korean. This broadcast was generated by artificial intelligence from publicly available sources and is not medical advice.`;
    const uploaded = await uploadVideoToYoutube({
      filePath: outputPath,
      accessToken,
      title: koreanTitle,
      description: koreanDescription,
      tags: [],
      categoryId: "27",
      privacyStatus: "public"
    });
    const koreanYoutubeUrl = `https://www.youtube.com/watch?v=${uploaded.id}`;
    console.log(`Uploaded Korean dub: ${koreanYoutubeUrl} (${koreanTitle})`);

    await source.report?.({
      koreanDubStatus: "done",
      koreanYoutubeVideoId: uploaded.id,
      koreanYoutubeUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await source.report?.({
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
