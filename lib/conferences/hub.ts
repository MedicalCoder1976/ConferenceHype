import { cache } from "react";
import { CONFERENCE_CATALOG } from "@/lib/conferences/catalog";
import type { ConferenceDetail, ConferenceStatus, ConferenceSummary, ConferenceVideo } from "@/lib/conferences/types";
import { identifyMeeting } from "@/lib/story/meetingUpdateNumbering";
import { createAdminClient } from "@/lib/supabase/admin";

// The public conference hub is built from delivered broadcasts, grouped by the
// same meeting registry that numbers Story updates. A broadcast that names no
// registered meeting (memorials, FDA news, 5 Things) is left out.

type Row = {
  meeting_label: string | null;
  title: string | null;
  specialty: string | null;
  youtube_video_id: string | null;
  created_at: string | null;
};

const UPDATE_LABEL = /^.*?\b(Update\s+\d+)\s*:\s*/i;

function toVideo(row: Row): ConferenceVideo {
  const title = (row.title ?? "").trim();
  const match = title.match(UPDATE_LABEL);
  return {
    videoId: row.youtube_video_id as string,
    title,
    label: match ? match[1].replace(/\s+/g, " ").replace(/^update/i, "Update") : null,
    headline: match ? title.slice(match[0].length).trim() : title,
    publishedAt: String(row.created_at ?? "")
  };
}

function statusFor(startDate: string | null, endDate: string | null, now: Date): ConferenceStatus {
  if (!endDate) return "unknown";
  const today = now.toISOString().slice(0, 10);
  if (endDate < today) return "concluded";
  if (startDate && startDate > today) return "upcoming";
  return "in_progress";
}

// Most common non-generic specialty on the meeting's rows, for a meeting the
// catalog does not describe yet.
function rowSpecialty(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = (row.specialty ?? "").trim();
    if (!value || /^story$/i.test(value)) continue;
    const normalized = value.charAt(0).toUpperCase() + value.slice(1);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General";
}

async function loadConferencesUncached(now = new Date()): Promise<ConferenceDetail[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("meeting_watch_broadcasts")
    .select("meeting_label,title,specialty,youtube_video_id,created_at")
    .in("status", ["verified", "uploaded"])
    .not("youtube_video_id", "is", null)
    .limit(5000);
  if (error) throw new Error(`Could not load conference videos: ${error.message}`);

  const groups = new Map<string, { identity: NonNullable<ReturnType<typeof identifyMeeting>>; rows: Row[] }>();
  for (const row of (data ?? []) as Row[]) {
    const label = (row.meeting_label ?? "").replace(/^Create a Story:\s*/i, "");
    const fallbackYear = row.created_at ? String(new Date(row.created_at).getFullYear()) : undefined;
    const identity = identifyMeeting(label, row.title ?? "", fallbackYear);
    if (!identity) continue;
    const slug = `${identity.key}-${identity.year}`;
    const group = groups.get(slug) ?? { identity, rows: [] };
    group.rows.push(row);
    groups.set(slug, group);
  }

  const conferences: ConferenceDetail[] = [];
  for (const [slug, { identity, rows }] of groups) {
    const catalog = CONFERENCE_CATALOG[identity.key];
    const edition = catalog?.editions?.[identity.year];
    const videos = rows
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
      .map(toVideo);
    const latest = videos[videos.length - 1];
    const startDate = edition?.startDate ?? null;
    const endDate = edition?.endDate ?? null;
    conferences.push({
      slug,
      key: identity.key,
      year: identity.year,
      displayName: identity.displayName,
      fullName: catalog ? `${catalog.fullName} ${identity.year}` : identity.displayName,
      field: catalog?.field ?? "medicine",
      specialty: catalog?.specialty ?? rowSpecialty(rows),
      city: edition?.city ?? null,
      startDate,
      endDate,
      status: statusFor(startDate, endDate, now),
      videoCount: videos.length,
      latestVideoId: latest.videoId,
      latestPublishedAt: latest.publishedAt,
      videos
    });
  }

  // Most recently covered first.
  return conferences.sort((a, b) => b.latestPublishedAt.localeCompare(a.latestPublishedAt));
}

// Deduplicated per request, so page metadata and the page share one query.
export const loadConferences = cache(() => loadConferencesUncached());

export function toSummary(conference: ConferenceDetail): ConferenceSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { videos, ...summary } = conference;
  return summary;
}
