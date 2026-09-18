import { formatFiveThingsDisclaimer } from "@/lib/story/fiveThingsDisclaimer";
import { specialistAudience } from "@/lib/youtube/broadcastMetadata";

export function repackageFiveThingsDescription(description: string, specialty: string, previousSpecialty: string) {
  const lines = description.split(/\r?\n/);
  const topics = lines.find((line) => line.startsWith("Topics covered:"))?.slice("Topics covered:".length).split(";") ?? [];
  const oldHashtag = `#${previousSpecialty.replace(/[^a-zA-Z0-9]/g, "")}`;
  const result = lines.filter((line) => !/^[A-Z &]+ DISCLAIMER:$/.test(line) && !line.startsWith("Medical & Educational Disclaimer:"))
    .map((line, index) => {
      if (index === 0) return `${specialty}: 5 things to know today.`;
      if (line.startsWith("Relevant specialty:")) return `Relevant specialty: ${specialty}.`;
      if (line.startsWith("Audience:")) return `Audience: Physicians; Medical Students; ${specialistAudience(specialty).join("; ")}; Advanced Practice Providers (APPs).`;
      if (line.trim().toLowerCase() === oldHashtag.toLowerCase()) return `#${specialty.replace(/[^a-zA-Z0-9]/g, "")}`;
      return line;
    });
  return `${result.join("\n").trim()}\n\n${formatFiveThingsDisclaimer(specialty, topics)}`;
}
