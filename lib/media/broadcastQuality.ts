import { spawn } from "node:child_process";

export type BroadcastQualityMode = "presentation" | "journal30" | "weekend30" | "regional30" | "breaking15" | "meeting_watch30" | "meetingWatchFiveNews" | "fiveThings15";

type QualityCard = { duration: number; isMusic: boolean; segmentId?: string; riskFlags?: string[] };

export function minimumSubstantiveCards(mode: BroadcastQualityMode, stationProgramId?: string) {
  if (mode === "breaking15") return 1;
  if (mode === "fiveThings15") return 5;
  if (mode === "meetingWatchFiveNews") return 5;
  if (mode === "weekend30") return 12;
  if (mode === "regional30") return 12;
  if (mode === "meeting_watch30") return 12;
  if (mode === "journal30") return stationProgramId ? 12 : 8;
  return 6;
}

export function assertMeetingWatchFiveNewsComplete(cards: QualityCard[]) {
  const sourcedNews = new Set(cards
    .filter((card) => !card.isMusic && card.segmentId && card.riskFlags?.includes("meeting_watch_five_news"))
    .map((card) => card.segmentId));
  const hasDisclaimer = cards.some((card) => !card.isMusic && card.riskFlags?.includes("prepared_disclaimer"));
  const hasClosing = cards.some((card) => !card.isMusic && card.riskFlags?.includes("prepared_closing"));
  const isFullNarrative = cards.some((card) => card.riskFlags?.includes("meeting_watch_full_narrative"));
  const itemCountValid = isFullNarrative ? sourcedNews.size >= 5 && sourcedNews.size <= 10 : sourcedNews.size === 5;
  if (!itemCountValid || !hasDisclaimer || !hasClosing) {
    throw new Error(`Meeting Watch completeness gate failed: found ${sourcedNews.size}/${isFullNarrative ? "5-10" : "5"} sourced items, disclaimer=${hasDisclaimer}, closing=${hasClosing}. Refusing to upload an incomplete story.`);
  }
  return { sourcedNewsItems: sourcedNews.size, hasDisclaimer, hasClosing };
}

export function assertMinimumSubstantiveCards({ cards, mode, stationProgramId }: {
  cards: QualityCard[]; mode: BroadcastQualityMode; stationProgramId?: string;
}) {
  const substantiveCardCount = new Set(
    cards.filter((card) => !card.isMusic && card.segmentId).map((card) => card.segmentId)
  ).size;
  const required = minimumSubstantiveCards(mode, stationProgramId);
  if (substantiveCardCount < required) {
    throw new Error(
      `Broadcast quality gate failed: ${substantiveCardCount} substantive source-backed card(s) remained after validation; ${required} are required for ${mode}. Refusing to render or upload a mostly-music video.`
    );
  }
  return substantiveCardCount;
}

export function parseVolumeDetect(stderr: string) {
  const meanMatch = stderr.match(/mean_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/i);
  const maxMatch = stderr.match(/max_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/i);
  const parse = (value?: string) =>
    !value || /^-?inf$/i.test(value) ? Number.NEGATIVE_INFINITY : Number(value);
  return { meanVolumeDb: parse(meanMatch?.[1]), maxVolumeDb: parse(maxMatch?.[1]) };
}

function analyzeWindow(ffmpeg: string, mediaPath: string, startSeconds: number, durationSeconds: number) {
  return new Promise<{ meanVolumeDb: number; maxVolumeDb: number }>((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-hide_banner", "-nostats", "-ss", startSeconds.toFixed(3), "-t",
      Math.max(0.1, durationSeconds).toFixed(3), "-i", mediaPath, "-map", "0:a:0",
      "-af", "volumedetect", "-f", "null", "-"
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Could not analyze rendered music audio (ffmpeg exit ${code}).`));
        return;
      }
      resolve(parseVolumeDetect(stderr));
    });
  });
}

export async function assertMusicWindowsAudible({ ffmpeg, mediaPath, cards }: {
  ffmpeg: string; mediaPath: string; cards: QualityCard[];
}) {
  const windows: Array<{ startSeconds: number; durationSeconds: number }> = [];
  let startSeconds = 0;
  for (const card of cards) {
    if (card.isMusic && card.duration > 0) windows.push({ startSeconds, durationSeconds: card.duration });
    startSeconds += card.duration;
  }
  if (windows.length === 0) throw new Error("Broadcast quality gate failed: no music windows were scheduled.");
  for (const [index, window] of windows.entries()) {
    const volume = await analyzeWindow(ffmpeg, mediaPath, window.startSeconds, window.durationSeconds);
    if (volume.maxVolumeDb < -35 || volume.meanVolumeDb < -50) {
      throw new Error(
        `Broadcast quality gate failed: music window ${index + 1} at ${window.startSeconds.toFixed(1)}s is silent or inaudible (mean ${volume.meanVolumeDb} dB, max ${volume.maxVolumeDb} dB). Refusing to upload.`
      );
    }
  }
}
