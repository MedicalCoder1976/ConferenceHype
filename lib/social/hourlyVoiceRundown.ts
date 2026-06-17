import { addMinutes } from "@/lib/rundown/slots";
import { monitoredXVoices } from "@/lib/sources/registry";
import type { Segment, SocialVoiceLeader, SpecialtyXVoice } from "@/lib/types";

function voiceLine(leader: SocialVoiceLeader, index: number) {
  const identity = leader.note ? ` They are ${leader.note}.` : "";
  return `${index + 1}. ${leader.label} ${leader.handle}, score ${leader.score}, ${leader.momentum} momentum.${identity}`;
}

export function buildHourlySocialVoiceRundownSegments({
  leaders,
  specialtyVoices = [],
  baseTime,
  hours = 1
}: {
  leaders: SocialVoiceLeader[];
  specialtyVoices?: SpecialtyXVoice[];
  baseTime: Date;
  hours?: number;
}): Segment[] {
  const risingLeaders = leaders
    .filter((leader) => leader.mentions > 0)
    .slice(0, 5);
  const watchedVoices = specialtyVoices
    .filter((voice) => voice.enabled && ["Oncology", "Hematology"].includes(voice.specialty))
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, 5);
  const registryVoices = monitoredXVoices.slice(0, 5);

  return Array.from({ length: hours }, (_, hourIndex) => {
    const scheduledAt = addMinutes(baseTime, hourIndex * 60 + 2);
    const fallbackVoices = watchedVoices.length ? watchedVoices : registryVoices;
    const lines = risingLeaders.length
      ? risingLeaders.map(voiceLine).join("\n")
      : fallbackVoices
          .map((voice, index) => {
            const specialty = "specialty" in voice ? `${voice.specialty} ` : "";
            return `${index + 1}. ${voice.label} ${voice.handle}. ${specialty}${voice.note || "operator-curated medical-conference voice"}.`;
          })
          .join("\n");
    const intro = risingLeaders.length
      ? "Two-minute social voice check. After the schedule, here are the rising conference X voices being watched right now."
      : watchedVoices.length
        ? "Two-minute social voice check. Recent X mentions have not cleared the leaderboard yet, so here are specialty-specific oncology voices on the operator watchlist."
        : "Two-minute social voice check. The hourly leaderboard is warming up, so this block tracks core medical-conference voices the desk is monitoring.";
    const citationVoices = risingLeaders.length
      ? risingLeaders.map((leader) => ({
          label: `${leader.label} ${leader.handle}`,
          url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
          sourceType: "verified_social" as const
        }))
      : fallbackVoices.map((voice) => ({
          label: `${voice.label} ${voice.handle}`,
          url: `https://x.com/${voice.handle.replace(/^@/, "")}`,
          sourceType: "verified_social" as const
        }));
    return {
      id: `virtual-hourly-social-voices-${scheduledAt.toISOString()}`,
      title: "Hourly rising social voices",
      summary:
        "Two-minute rundown of monitored medical-conference social voices and why they matter.",
      script: `${intro}\n\n${lines}`,
      contentType: "social_signal",
      personaId: "vesper-quill",
      personaName: "Vesper Quill",
      hypeLevel: "high_energy",
      language: "English",
      status: "approved",
      citations: citationVoices,
      socialBuzzItems: citationVoices.map((citation) => ({
        label: `${citation.label} hourly social voice`,
        url: citation.url,
        sourceType: "verified_social" as const
      })),
      riskFlags: ["virtual_hourly_social_voice_rundown", "two_minute_social_voice_check"],
      confidenceScore: risingLeaders.length ? 82 : watchedVoices.length ? 76 : 70,
      createdAt: scheduledAt.toISOString(),
      approvedAt: scheduledAt.toISOString(),
      updatedAt: scheduledAt.toISOString()
    };
  });
}
