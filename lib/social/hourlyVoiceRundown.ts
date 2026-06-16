import { addMinutes } from "@/lib/rundown/slots";
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

  return Array.from({ length: hours }, (_, hourIndex) => {
    const scheduledAt = addMinutes(baseTime, hourIndex * 60 + 2);
    const lines = risingLeaders.length
      ? risingLeaders.map(voiceLine).join("\n")
      : watchedVoices.length
        ? watchedVoices
            .map(
              (voice, index) =>
                `${index + 1}. ${voice.label} ${voice.handle}. Specialty: ${voice.specialty}. Watchlist note: ${voice.note || "operator-curated specialty voice"}.`
            )
            .join("\n")
        : "No rising conference X voices have cleared the source monitor for this hour yet.";
    const intro = risingLeaders.length
      ? "Two-minute social voice check. After the schedule, here are the rising conference X voices being watched right now."
      : watchedVoices.length
        ? "Two-minute social voice check. Recent X mentions have not cleared the leaderboard yet, so here are specialty-specific oncology voices on the operator watchlist."
        : "Two-minute social voice check. After the schedule, here are the rising conference X voices being watched right now.";
    const citationVoices = risingLeaders.length
      ? risingLeaders.map((leader) => ({
          label: `${leader.label} ${leader.handle}`,
          url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
          sourceType: "verified_social" as const
        }))
      : watchedVoices.map((voice) => ({
          label: `${voice.label} ${voice.handle}`,
          url: `https://x.com/${voice.handle.replace(/^@/, "")}`,
          sourceType: "verified_social" as const
        }));
    return {
      id: `virtual-hourly-social-voices-${scheduledAt.toISOString()}`,
      title: "Hourly rising social voices",
      summary:
        "Two-minute source-attributed rundown of rising X voices and who they are.",
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
      confidenceScore: risingLeaders.length ? 82 : watchedVoices.length ? 76 : 60,
      createdAt: scheduledAt.toISOString(),
      approvedAt: scheduledAt.toISOString(),
      updatedAt: scheduledAt.toISOString()
    };
  });
}
