import type { Segment } from "@/lib/types";

export const OPERATOR_MUSIC_FLAG = "operator_music_card";
export const OPERATOR_MUSIC_PATH_PREFIX = "operator_music_path:";
export const OPERATOR_MUSIC_SECONDS = 180;

export type OperatorMusicTrack = {
  id: string;
  title: string;
  family: "Funk" | "Latin";
  bpm: number;
  publicPath: string;
};

const tracks = [
  ...Array.from({ length: 10 }, (_, index) => ({
    family: "Funk" as const,
    number: index + 1,
    bpm: [144, 148, 152, 156, 160, 146, 150, 154, 158, 162][index],
    fileNumber: index + 1
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    family: "Latin" as const,
    number: index + 1,
    bpm: [140, 144, 148, 152, 156, 142, 146, 150, 154, 158][index],
    fileNumber: index + 11
  }))
];

export const OPERATOR_MUSIC_TRACKS: OperatorMusicTrack[] = tracks.map(
  ({ family, number, bpm, fileNumber }) => {
    const stem = `${family.toLowerCase()}-${String(number).padStart(2, "0")}`;
    const fileName = `conferencehype-fast-jazz-${String(fileNumber).padStart(2, "0")}-${family.toLowerCase()}-variation-${String(number).padStart(2, "0")}-${bpm}bpm-3min.mp3`;
    return {
      id: stem,
      title: `${family} variation ${number}`,
      family,
      bpm,
      publicPath: `/music/fast-jazz-blocks/${fileName}`
    };
  }
);

export function operatorMusicTrack(trackId: string) {
  return OPERATOR_MUSIC_TRACKS.find((track) => track.id === trackId);
}

export function isOperatorMusicSegment(
  segment: { riskFlags?: string[] } | undefined
) {
  return Boolean(segment?.riskFlags?.includes(OPERATOR_MUSIC_FLAG));
}

export function operatorMusicPath(segment: Pick<Segment, "riskFlags"> | undefined) {
  const value = segment?.riskFlags.find((flag) =>
    flag.startsWith(OPERATOR_MUSIC_PATH_PREFIX)
  );
  return value?.slice(OPERATOR_MUSIC_PATH_PREFIX.length);
}

export function buildOperatorMusicSegment({
  track,
  approvedAt
}: {
  track: OperatorMusicTrack;
  approvedAt: string;
}): Segment {
  const now = new Date().toISOString();
  return {
    id: `operator-music-${track.id}-${Date.now()}`,
    title: track.title,
    summary: `Three-minute ${track.family.toLowerCase()} instrumental music break.`,
    script: "Instrumental music break.",
    contentType: "hype_clip",
    personaId: "echo-sage",
    personaName: "ConferenceHype Music",
    hypeLevel: "high_energy",
    language: "Instrumental",
    status: "approved",
    citations: [
      {
        label: "ConferenceHype original instrumental music",
        url: track.publicPath,
        sourceType: "manual"
      }
    ],
    socialBuzzItems: [],
    riskFlags: [
      OPERATOR_MUSIC_FLAG,
      `${OPERATOR_MUSIC_PATH_PREFIX}${track.publicPath}`,
      `operator_music_family:${track.family.toLowerCase()}`,
      `operator_music_bpm:${track.bpm}`
    ],
    confidenceScore: 100,
    createdAt: now,
    approvedAt,
    updatedAt: now
  };
}
