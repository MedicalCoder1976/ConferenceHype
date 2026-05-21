import { generateSegmentFromSources } from "@/lib/generation/llm";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { saveGeneratedSegmentsToDb } from "@/lib/db";

export async function runGenerateJob() {
  const items = await runIngestionJob();
  const socialItems = items.filter((item) => item.sourceType.includes("social"));
  const primaryItems = items.filter((item) => !item.sourceType.includes("social"));

  const segments = await Promise.all([
    generateSegmentFromSources({
      sources: primaryItems.slice(0, 8),
      personaId: "echo-sage",
      hypeLevel: "standard"
    }),
    generateSegmentFromSources({
      sources: socialItems.slice(0, 8),
      personaId: "vesper-quill",
      hypeLevel: "high_energy",
      editorialInstruction:
        "Treat #ASCOHype, #AskASCOHype, #ASCO26, @ASCOHypeAI, and monitored X voice posts as audience buzz that requires review. Use #ASCO26 and watched X voices for commentary ideas and topic discovery, but do not treat them as verified fact. If a watched X voice is useful, call out the handle and source name clearly. If posts recommend snacks or coffee in the Exhibitor Hall, frame them as attendee tips, not endorsements, and remind listeners that availability and locations can change."
    })
  ]);
  await saveGeneratedSegmentsToDb(segments);
  return segments;
}
