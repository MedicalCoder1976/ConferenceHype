import { getAscoBriefingSources, getAscoCoreStats } from "@/lib/asco2026/core";
import { saveGeneratedSegmentsToDb } from "@/lib/db";
import { generateSegmentFromSources } from "@/lib/generation/llm";

export async function runBriefingJob(now = new Date()) {
  const sources = getAscoBriefingSources(now);
  const stats = getAscoCoreStats();

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
      `Frame the last ${stats.lookbackMinutes} minutes as what just happened and the next ${stats.lookaheadMinutes} minutes as where attendees may want to head next.`,
      "Use reporter/commentator language only.",
      "Do not interpret abstracts as validated science; describe them as scheduled presentations, abstracts, posters, or buzz.",
      "Prioritize concrete session titles, times, tracks, and locations over broad commentary.",
      "Keep the script concise enough for a 3-minute audio segment."
    ].join("\n")
  });

  await saveGeneratedSegmentsToDb([segment]);
  return [segment];
}
