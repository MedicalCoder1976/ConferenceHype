import { getYoutubeAccessToken } from "@/lib/youtube/uploadBroadcastVideo";

async function main() {
  const ids = process.argv.slice(2).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id));
  if (!ids.length) throw new Error("Provide at least one valid YouTube video ID.");
  const accessToken = await getYoutubeAccessToken();
  for (const id of ids) {
    const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } })
    });
    if (!response.ok) throw new Error(`Could not quarantine ${id}: ${response.status} ${await response.text()}`);
    const check = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = await check.json() as { items?: Array<{ status?: { privacyStatus?: string } }> };
    if (!check.ok || result.items?.[0]?.status?.privacyStatus !== "private") {
      throw new Error(`YouTube did not confirm ${id} is private.`);
    }
    console.log(JSON.stringify({ youtube_video_id: id, privacyStatus: "private" }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
