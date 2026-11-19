import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYoutubeAccessToken, updateYoutubeVideoMetadata } from "@/lib/youtube/uploadBroadcastVideo";

loadEnvConfig(process.cwd());

// Removes one wrongly listed study from an existing video's description:
// its entry on the "Studies covered:" line, its hashtag, and its YouTube tag.
// Title, thumbnail and everything else stay as they are. Added 2026-11-19 for
// ASH 2026 Update 7, whose description listed "Dfp-10917 trial" from the
// narration's series bridge (fixed going forward in meetingWatchMetadata.ts).

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

type Snippet = { title?: string; description?: string; tags?: string[]; categoryId?: string };

async function fetchSnippet(videoId: string, accessToken: string) {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`YouTube lookup failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { items?: Array<{ snippet?: Snippet }> };
  const snippet = payload.items?.[0]?.snippet;
  if (!snippet) throw new Error(`YouTube video ${videoId} was not found.`);
  return snippet;
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function removeStudyFromDescription(description: string, study: string) {
  const target = squash(study);
  return description
    .split("\n")
    .flatMap((line) => {
      const covered = line.match(/^Studies covered:\s*(.*?)\.?\s*$/);
      if (covered) {
        const kept = covered[1].split(";").map((name) => name.trim()).filter((name) => name && squash(name) !== target);
        return kept.length ? [`Studies covered: ${kept.join("; ")}.`] : [];
      }
      if (/(^|\s)#\S/.test(line)) {
        const cleaned = line.split(/\s+/).filter((word) => !(word.startsWith("#") && squash(word) === target)).join(" ").trim();
        return cleaned ? [cleaned] : [];
      }
      return [line];
    })
    .join("\n");
}

async function main() {
  const videoId = required("YOUTUBE_VIDEO_ID");
  const study = required("STUDY_NAME");
  const accessToken = await getYoutubeAccessToken();
  const before = await fetchSnippet(videoId, accessToken);
  const description = removeStudyFromDescription(before.description ?? "", study);
  const tags = (before.tags ?? []).filter((tag) => squash(tag) !== squash(study));
  if (description === (before.description ?? "") && tags.length === (before.tags ?? []).length) {
    console.log(JSON.stringify({ ok: true, videoId, changed: false, note: `"${study}" was not listed.` }, null, 2));
    return;
  }
  await updateYoutubeVideoMetadata({
    videoId,
    accessToken,
    title: before.title ?? "",
    description,
    tags,
    categoryId: before.categoryId ?? "27"
  });
  let after = await fetchSnippet(videoId, accessToken);
  for (let attempt = 0; attempt < 6 && after.description !== description; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    after = await fetchSnippet(videoId, accessToken);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("meeting_watch_broadcasts")
    .update({ description, updated_at: new Date().toISOString() })
    .eq("youtube_video_id", videoId)
    .select("id");
  if (error) throw error;
  const stillListed = squash(after.description ?? "").includes(squash(study));
  console.log(JSON.stringify({ ok: !stillListed, videoId, study, tagsRemoved: (before.tags ?? []).length - tags.length, storedRows: data?.length ?? 0 }, null, 2));
  if (stillListed) throw new Error("YouTube still reports the study in the description.");
}

if (process.argv[1]?.includes("remove-study-from-youtube-description")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
