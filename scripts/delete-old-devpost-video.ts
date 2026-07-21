import { getYoutubeAccessToken } from "@/lib/youtube/uploadBroadcastVideo";

const videoId = process.argv[2];
if (!videoId) throw new Error("Video ID is required.");

async function main() {
  const accessToken = await getYoutubeAccessToken();
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`YouTube delete failed: ${response.status} ${await response.text()}`);
  console.log(`DELETED_VIDEO_ID=${videoId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
