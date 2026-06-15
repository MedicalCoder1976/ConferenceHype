import {
  getRecentIngestedItemsFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import { generateSegmentFromSources } from "@/lib/generation/llm";

export async function runBriefingJob(now = new Date()) {
  const sources = (await getRecentIngestedItemsFromDb(6, 20)) ?? [];
  if (sources.length === 0) {
    return [];
  }

  const segment = await generateSegmentFromSources({
    sources,
    personaId: "echo-sage",
    hypeLevel: "standard",
    contentType: "agenda_preview",
    editorialInstruction: [
      "Create a tight 3-minute conference-desk briefing.",
      "Use only the supplied source material.",
      "Use reporter/commentator language only.",
      "Do not interpret abstracts as validated science.",
      `Treat ${now.toISOString()} as the briefing reference time.`,
      "Prioritize concrete session titles, times, tracks, locations, and source-attributed updates.",
      "Keep the script concise enough for a 3-minute audio segment."
    ].join("\n")
  });

  await saveGeneratedSegmentsToDb([segment]);
  return [segment];
}
