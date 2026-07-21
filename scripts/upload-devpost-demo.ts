import { getYoutubeAccessToken, uploadVideoToYoutube } from "@/lib/youtube/uploadBroadcastVideo";

const filePath = process.argv[2];
if (!filePath) throw new Error("Video path is required.");

async function main() {
  const accessToken = await getYoutubeAccessToken();
  const video = await uploadVideoToYoutube({
    filePath,
    accessToken,
    title: "ConferenceHype — OpenAI Build Week 2026 Demo",
    description: [
      "ConferenceHype turns newly indexed medical journal articles and conference information into source-grounded, operator-reviewed medical education broadcasts.",
      "",
      "This revised demo shows the public experience, PubMed-first journal pipeline, editorial card review, complete-video rendering, and YouTube delivery workflow.",
      "",
      "Built and substantially extended with Codex during OpenAI Build Week 2026.",
      "",
      "https://conferencehype.com",
      "",
      "Educational AI commentary only. Not medical advice. Review the original publication before clinical use."
    ].join("\n"),
    tags: ["ConferenceHype", "medical education", "PubMed", "medical conferences", "Codex", "OpenAI Build Week", "AI"],
    categoryId: "28"
  });
  console.log(`YOUTUBE_URL=https://www.youtube.com/watch?v=${video.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
