import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import ffmpegPath from "ffmpeg-static";
import type { Segment } from "@/lib/types";

const durationSeconds = Number(process.env.HOUR_BROADCAST_SECONDS ?? 3600);
const renderDir = process.env.HOUR_BROADCAST_DIR ?? "public/rendered/hour-broadcast";
const outputPath =
  process.env.HOUR_BROADCAST_OUTPUT ?? "public/rendered/asco-hype-hour-broadcast.mp4";
const musicPath =
  process.env.HOUR_BROADCAST_MUSIC ??
  "public/music/conferencehype-gap-music-6min-v3.mp3";
const voicePath = process.env.HOUR_BROADCAST_VOICE;

loadEnvConfig(process.cwd());

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

function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/%/g, " percent")
    .replace(/\bwe verify\b/gi, "we attribute")
    .replace(/\bverify\b/gi, "check")
    .replace(/\bverified\b/gi, "source-backed")
    .replace(/\bairtime\b/gi, "the rundown")
    .replace(/\baired\b/gi, "covered")
    .replace(/\bairing\b/gi, "playing")
    .replace(/\bair\b/gi, "play")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function wrapLine(line: string, width: number) {
  const words = cleanText(line).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function formatCard({
  eyebrow,
  title,
  body,
  source
}: {
  eyebrow: string;
  title: string;
  body: string;
  source?: string;
}) {
  const lines = [
    eyebrow.toUpperCase(),
    "",
    ...wrapLine(title, 43).slice(0, 3),
    "",
    ...wrapLine(body, 58).slice(0, 10)
  ];

  if (source) {
    lines.push("", ...wrapLine(`Source: ${source}`, 64).slice(0, 2));
  }

  lines.push("", "ASCO Hype: social/news commentary. Check clinical details at the source.");
  return lines.join("\n");
}

async function buildCards() {
  const [
    { filterBroadcastReadySegments },
    { getNextBroadcastSegmentsFromDb, getPendingSegmentsFromDb, getSocialVoiceLeaderboardFromDb },
    { buildScheduleRundownSegments },
    { buildHourlySocialVoiceRundownSegments },
    { buildBroadcastSlots }
  ] = await Promise.all([
    import("@/lib/data"),
    import("@/lib/db"),
    import("@/lib/jobs/upcomingEvents"),
    import("@/lib/social/hourlyVoiceRundown"),
    import("@/lib/rundown/slots")
  ]);
  const baseTime = process.env.HOUR_BROADCAST_START
    ? new Date(process.env.HOUR_BROADCAST_START)
    : new Date();
  const hours = Math.max(1, Math.ceil(durationSeconds / 3600));
  const [approved, pending, leaderboard] = await Promise.all([
    getNextBroadcastSegmentsFromDb(180),
    getPendingSegmentsFromDb(180),
    getSocialVoiceLeaderboardFromDb()
  ]);
  const slots = buildBroadcastSlots({
    segments: filterBroadcastReadySegments(approved ?? []),
    reviewSegments: filterBroadcastReadySegments(pending ?? []),
    scheduleSegments: buildScheduleRundownSegments(baseTime),
    socialVoiceSegments: buildHourlySocialVoiceRundownSegments({
      leaders: leaderboard ?? [],
      baseTime
    }),
    baseTime,
    hours
  }).filter((slot) => slot.at < new Date(baseTime.getTime() + durationSeconds * 1000));

  return slots.map((slot, index) => ({
    duration: slot.durationSeconds,
    text:
      slot.kind === "music"
        ? formatCard({
            eyebrow: "Music card",
            title: "Ten-second music transition",
            body: "Short music bed. Next content card follows immediately."
          })
        : formatCard({
            eyebrow: `${slot.segment?.personaName ?? "ASCO Hype"} / ${slot.segment?.contentType.replace(/_/g, " ") ?? "content"}`,
            title: slot.segment?.title ?? slot.label,
            body: slot.segment?.script || slot.segment?.summary || slot.label,
            source: slot.segment?.citations[0]?.url
          })
  }));
}

async function main() {
  const ffmpeg = ffmpegPath ?? "ffmpeg";
  const cards = await buildCards();
  await mkdir(renderDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const concatLines: string[] = [];

  for (let index = 0; index < cards.length; index += 1) {
    const slidePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.txt`);
    const imagePath = path.join(renderDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
    await writeFile(slidePath, cards[index].text, "utf8");
    const color = index % 2 === 0 ? "0x11151f" : "0x151a27";
    const textPath = slidePath.replace(/\\/g, "/");
    const imageFilter =
      `drawbox=x=0:y=0:w=1280:h=18:color=0xf4483a@1:t=fill,` +
        `drawbox=x=0:y=702:w=1280:h=18:color=0x33d6c5@1:t=fill,` +
        `drawtext=font='Arial':textfile='${textPath}':x=70:y=72:fontsize=31:` +
        `fontcolor=white:line_spacing=13`;
    await run(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1280x720`,
      "-vf",
      imageFilter,
      "-frames:v",
      "1",
      imagePath
    ]);
    const concatPath = path.resolve(imagePath).replace(/\\/g, "/");
    concatLines.push(`file '${concatPath}'`, `duration ${cards[index].duration}`);
  }
  const lastImage = path
    .resolve(renderDir, `slide-${String(cards.length).padStart(2, "0")}.png`)
    .replace(/\\/g, "/");
  concatLines.push(`file '${lastImage}'`);
  const concatPath = path.join(renderDir, "slides.ffconcat");
  await writeFile(concatPath, concatLines.join("\n"), "utf8");

  const hasVoice = Boolean(voicePath);
  const audioArgs = hasVoice
    ? [
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-stream_loop",
        "-1",
        "-i",
        voicePath!,
        "-filter_complex",
        "[1:a]volume=0.18[music];[2:a]volume=0.85[voice];[music][voice]amix=inputs=2:duration=first:dropout_transition=0[a]"
      ]
    : [
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        "[1:a]volume=0.18[a]"
      ];

  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    ...audioArgs,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-r",
    "30",
    "-t",
    String(durationSeconds),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    outputPath
  ];

  console.log(
    JSON.stringify(
      {
        cards: cards.length,
        contentCards: cards.filter((card) => card.duration === 110).length,
        musicCards: cards.filter((card) => card.duration === 10).length,
        durationSeconds,
        outputPath,
        musicPath,
        voicePath: voicePath ?? null
      },
      null,
      2
    )
  );
  await run(ffmpeg, args);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
