import type { ConferenceField } from "@/lib/conferences/catalog";

// Shared by the server loader and the client browser components, so this file
// must not import anything server-only.

export type ConferenceStatus = "upcoming" | "in_progress" | "concluded" | "unknown";

export type ConferenceVideo = {
  videoId: string;
  title: string;
  // "Update 30" when the YouTube title carries the production label.
  label: string | null;
  headline: string;
  publishedAt: string;
};

export type ConferenceSummary = {
  slug: string;
  key: string;
  year: string;
  displayName: string;
  fullName: string;
  field: ConferenceField;
  specialty: string;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ConferenceStatus;
  videoCount: number;
  latestVideoId: string;
  latestPublishedAt: string;
};

export type ConferenceDetail = ConferenceSummary & {
  // Oldest first, in series order.
  videos: ConferenceVideo[];
};

export function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

// YouTube builds an unsaved playlist from up to 50 ids, so the site needs no
// OAuth call to offer "watch the whole series".
export function seriesPlaylistUrl(videos: ConferenceVideo[]) {
  const ids = videos.slice(-50).map((video) => video.videoId).join(",");
  return `https://www.youtube.com/watch_videos?video_ids=${ids}`;
}

export function formatConferenceDates(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  const month = (d: Date) => d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = e.getUTCFullYear();
  if (start === end) return `${month(s)} ${s.getUTCDate()}, ${year}`;
  if (s.getUTCMonth() === e.getUTCMonth()) return `${month(s)} ${s.getUTCDate()}–${e.getUTCDate()}, ${year}`;
  return `${month(s)} ${s.getUTCDate()} – ${month(e)} ${e.getUTCDate()}, ${year}`;
}
