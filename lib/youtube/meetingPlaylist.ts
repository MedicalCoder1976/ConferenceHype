// Series playlists (operator rule 2026-10-14): every repeat-conference Story is
// added to one public playlist per meeting and year, so a viewer who finishes
// one update rolls straight into the next. Uses the same OAuth access token as
// the upload (scope https://www.googleapis.com/auth/youtube covers playlists).
//
// Every caller treats these functions as best-effort: a playlist problem must
// never turn a delivered video into a failed delivery.

const API = "https://www.googleapis.com/youtube/v3";

export function meetingPlaylistTitle(displayName: string) {
  return `${displayName} Updates | ConferenceHype`;
}

export function playlistUrl(playlistId: string) {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

async function youtubeJson<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  if (!response.ok) {
    throw new Error(`YouTube ${path.split("?")[0]} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export async function findPlaylistByTitle(accessToken: string, title: string): Promise<string | null> {
  let pageToken = "";
  for (let page = 0; page < 10; page += 1) {
    const data = await youtubeJson<{ items?: { id: string; snippet?: { title?: string } }[]; nextPageToken?: string }>(
      accessToken,
      `/playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`
    );
    const match = (data.items ?? []).find((item) => item.snippet?.title === title);
    if (match) return match.id;
    if (!data.nextPageToken) return null;
    pageToken = data.nextPageToken;
  }
  return null;
}

export async function createPlaylist(accessToken: string, title: string, description: string): Promise<string> {
  const data = await youtubeJson<{ id: string }>(accessToken, "/playlists?part=snippet,status", {
    method: "POST",
    body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus: "public" } })
  });
  return data.id;
}

export async function listPlaylistVideoIds(accessToken: string, playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const data = await youtubeJson<{ items?: { snippet?: { resourceId?: { videoId?: string } } }[]; nextPageToken?: string }>(
      accessToken,
      `/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`
    );
    for (const item of data.items ?? []) {
      const id = item.snippet?.resourceId?.videoId;
      if (id) ids.push(id);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

export async function addVideoToPlaylist(accessToken: string, playlistId: string, videoId: string) {
  await youtubeJson(accessToken, "/playlistItems?part=snippet", {
    method: "POST",
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
  });
}

// Find the meeting's playlist or create it. Returns the id and whether it was
// created in this call.
export async function ensureMeetingPlaylist(accessToken: string, displayName: string) {
  const title = meetingPlaylistTitle(displayName);
  const existing = await findPlaylistByTitle(accessToken, title);
  if (existing) return { id: existing, url: playlistUrl(existing), created: false };
  const id = await createPlaylist(
    accessToken,
    title,
    `Every ConferenceHype update from ${displayName}, in the order they were published. Start at the top and keep watching.`
  );
  return { id, url: playlistUrl(id), created: true };
}

// Make the playlist contain every earlier delivered video (oldest first) and
// then the current one, without duplicating anything already in it.
export async function syncMeetingPlaylist({
  accessToken,
  playlistId,
  earlierVideoIdsOldestFirst,
  currentVideoId
}: {
  accessToken: string;
  playlistId: string;
  earlierVideoIdsOldestFirst: string[];
  currentVideoId: string;
}) {
  const present = new Set(await listPlaylistVideoIds(accessToken, playlistId));
  const toAdd = [...earlierVideoIdsOldestFirst, currentVideoId].filter((id, index, all) => !present.has(id) && all.indexOf(id) === index);
  for (const videoId of toAdd) await addVideoToPlaylist(accessToken, playlistId, videoId);
  return { added: toAdd.length, alreadyPresent: present.size };
}
