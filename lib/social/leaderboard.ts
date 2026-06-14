import { monitoredXVoices, type XVoice } from "@/lib/sources/registry";
import type { IngestedItem, Segment, SocialVoiceLeader } from "@/lib/types";

function normalizeHandle(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/@?[A-Za-z0-9_]{1,15}/);
  if (!match) {
    return "";
  }
  return `@${match[0].replace(/^@/, "")}`;
}

function scoreFromItem(item: IngestedItem) {
  // Prefer the structured engagement score, fall back to any score embedded in text
  if (item.engagementScore && item.engagementScore > 0) {
    return item.engagementScore;
  }
  const scoreMatch = item.excerpt.match(/Engagement score:\s*(\d+)/i);
  if (scoreMatch?.[1]) {
    return Number(scoreMatch[1]);
  }
  return 0;
}

function labelForHandle(handle: string, voices: XVoice[]) {
  const voice = voices.find(
    (v) => v.handle.toLowerCase() === handle.toLowerCase()
  );
  return voice ? { label: voice.label, note: voice.note } : { label: handle, note: "conference social voice" };
}

export function buildSocialVoiceLeaderboard(
  items: IngestedItem[],
  customVoices: XVoice[] = [],
  blacklistedHandles: string[] = []
): SocialVoiceLeader[] {
  const blacklisted = new Set(blacklistedHandles.map((handle) => handle.toLowerCase()));
  const allVoices = [...monitoredXVoices, ...customVoices];

  // Score ONLY from real ingested data — no pre-seeding with fake fallback numbers.
  // Every voice must earn its place by actually appearing in the recent X search results.
  const byHandle = new Map<string, SocialVoiceLeader>();

  for (const item of items) {
    const handle = normalizeHandle(item.author);
    if (!handle) {
      continue;
    }
    const key = handle.toLowerCase();
    if (blacklisted.has(key)) {
      continue;
    }
    const meta = labelForHandle(handle, allVoices);
    const existing = byHandle.get(key) ?? ({
      label: meta.label,
      handle,
      note: meta.note,
      score: 0,
      mentions: 0,
      momentum: "new"
    } satisfies SocialVoiceLeader);

    existing.mentions += 1;
    existing.score += 10 + scoreFromItem(item);
    existing.lastSeen = item.publishedAt ?? existing.lastSeen;
    existing.momentum = existing.mentions >= 3 ? "rising" : existing.mentions >= 1 ? "steady" : "new";
    byHandle.set(key, existing);
  }

  const ranked = Array.from(byHandle.values())
    .filter((leader) => leader.mentions > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.mentions - a.mentions;
    });

  // Return top 10 active voices. If nothing has come in yet, return empty —
  // the UI will show a "warming up" message instead of fake scores.
  return ranked.slice(0, 20);
}

export function shouldRunSocialVoiceCompetition() {
  return true;
}

export function buildSocialVoiceCompetitionSegment(
  leaders: SocialVoiceLeader[],
  now = new Date()
): Segment {
  const topThree = leaders.slice(0, 3);
  const board = topThree
    .map(
      (leader, index) =>
        `Number ${index + 1}: ${leader.label} ${leader.handle}, score ${leader.score}, ${leader.momentum} momentum.`
    )
    .join("\n");
  const routing =
    "Tag #ConferenceHype, #ASCO26, and #ASCO2026 on X or Instagram to nominate the next monitored voice, official schedule item, article, or media moment.";

  return {
    id: `social-voice-competition-${now.toISOString()}`,
    title: "Hourly social voice leaderboard",
    summary:
      "Competition-style leaderboard for watched X voices and audience social signals.",
    script: `Social voice scoreboard check. Every hour, ConferenceHype ranks the voices lighting up the ASCO conversation on X. Top voices are added to the monitored callout list for source-attributed broadcast commentary.\n\n${board || "The board is still warming up. More ASCO26 signal needed before we can crown a leader."}\n\n${routing}`,
    contentType: "social_signal",
    personaId: "vesper-quill",
    personaName: "Vesper Quill",
    hypeLevel: "high_energy",
    language: "English",
    status: "approved",
    citations: topThree.map((leader) => ({
      label: `${leader.label} ${leader.handle}`,
      url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
      sourceType: "verified_social" as const
    })),
    socialBuzzItems: topThree.map((leader) => ({
      label: `${leader.handle} social voice leaderboard`,
      url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
      sourceType: "verified_social" as const
    })),
    riskFlags: ["verified_social_voice_leaderboard", "leaderboard_is_hype_not_clinical_verification"],
    confidenceScore: 74,
    createdAt: now.toISOString()
  };
}
