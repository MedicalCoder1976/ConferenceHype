import { addMinutes } from "@/lib/rundown/slots";
import type { Segment, SocialVoiceLeader } from "@/lib/types";

function voiceLine(leader: SocialVoiceLeader, index: number) {
  const identity = leader.note ? ` They are ${leader.note}.` : "";
  return `${index + 1}. ${leader.label} ${leader.handle}, score ${leader.score}, ${leader.momentum} momentum.${identity}`;
}

export function buildHourlySocialVoiceRundownSegments({
  leaders,
  baseTime,
  hours = 1
}: {
  leaders: SocialVoiceLeader[];
  baseTime: Date;
  hours?: number;
}): Segment[] {
  const risingLeaders = leaders
    .filter((leader) => leader.mentions > 0)
    .slice(0, 5);

  return Array.from({ length: hours }, (_, hourIndex) => {
    const scheduledAt = addMinutes(baseTime, hourIndex * 60 + 2);
    const lines = risingLeaders.length
      ? risingLeaders.map(voiceLine).join("\n")
      : "No rising ASCO X voices have cleared the source monitor for this hour yet.";
    return {
      id: `virtual-hourly-social-voices-${scheduledAt.toISOString()}`,
      title: "Hourly rising social voices",
      summary:
        "Two-minute source-attributed rundown of rising X voices and who they are.",
      script: `Two-minute social voice check. After the schedule, here are the rising ASCO X voices being watched right now.\n\n${lines}`,
      contentType: "social_signal",
      personaId: "vesper-quill",
      personaName: "Vesper Quill",
      hypeLevel: "high_energy",
      language: "English",
      status: "approved",
      citations: risingLeaders.map((leader) => ({
        label: `${leader.label} ${leader.handle}`,
        url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
        sourceType: "verified_social" as const
      })),
      socialBuzzItems: risingLeaders.map((leader) => ({
        label: `${leader.handle} hourly rising social voice`,
        url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
        sourceType: "verified_social" as const
      })),
      riskFlags: ["virtual_hourly_social_voice_rundown", "two_minute_social_voice_check"],
      confidenceScore: risingLeaders.length ? 82 : 60,
      createdAt: scheduledAt.toISOString(),
      approvedAt: scheduledAt.toISOString(),
      updatedAt: scheduledAt.toISOString()
    };
  });
}
