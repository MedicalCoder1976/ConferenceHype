import { monitoredXVoices, type XVoice } from "@/lib/sources/registry";
import type { IngestedItem, Segment, SocialVoiceLeader } from "@/lib/types";
import { defaultDisclaimer } from "@/lib/generation/disclaimers";

const fallbackScores = [92, 86, 81, 75, 69, 64, 58, 53];

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

function scoreFromText(item: IngestedItem) {
  const scoreMatch = item.excerpt.match(/Engagement score:\s*(\d+)/i);
  if (scoreMatch?.[1]) {
    return Number(scoreMatch[1]);
  }
  return item.engagementScore ?? 0;
}

export function buildSocialVoiceLeaderboard(
  items: IngestedItem[],
  customVoices: XVoice[] = []
): SocialVoiceLeader[] {
  const voices = [...monitoredXVoices, ...customVoices];
  const byHandle = new Map<string, SocialVoiceLeader>();

  for (const voice of voices) {
    const handle = normalizeHandle(voice.handle);
    if (!handle || byHandle.has(handle.toLowerCase())) {
      continue;
    }
    byHandle.set(handle.toLowerCase(), {
      label: voice.label,
      handle,
      note: voice.note,
      score: 0,
      mentions: 0,
      momentum: "new"
    });
  }

  for (const item of items) {
    const handle = normalizeHandle(item.author);
    if (!handle) {
      continue;
    }
    const key = handle.toLowerCase();
    const existing =
      byHandle.get(key) ??
      ({
        label: handle,
        handle,
        note: "audience or media social voice",
        score: 0,
        mentions: 0,
        momentum: "new"
      } satisfies SocialVoiceLeader);

    existing.mentions += 1;
    existing.score += 10 + scoreFromText(item);
    existing.lastSeen = item.publishedAt ?? existing.lastSeen;
    existing.momentum = existing.mentions > 1 ? "rising" : "steady";
    byHandle.set(key, existing);
  }

  const ranked = Array.from(byHandle.values()).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.mentions - a.mentions;
  });

  return ranked.slice(0, 8).map((leader, index) => ({
    ...leader,
    score: leader.score || fallbackScores[index] || 50,
    mentions: leader.mentions || 0,
    momentum: leader.mentions === 0 ? "new" : leader.momentum
  }));
}

export function shouldRunSocialVoiceCompetition(now = new Date()) {
  return now.getUTCHours() % 3 === 0;
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
    "Tag #ASCOHype and #ASCO26 on X or Instagram to nominate the next voice, snack tip, W-poster hit, or media moment.";

  return {
    id: `social-voice-competition-${now.toISOString()}`,
    title: "Three-hour social voice leaderboard",
    summary:
      "Competition-style leaderboard for watched X voices and audience social signals.",
    script: `${defaultDisclaimer}\n\nSocial voice scoreboard check. Every three hours, ASCO Hype is ranking the voices lighting up the conference conversation. This is a hype board, not a verification board: social posts are buzz until an operator reviews the source.\n\n${board || "The board is warming up. The desk needs more tagged social signals before crowning a leader."}\n\n${routing} Operators will review the best signals before anything airs.\n\nReminder: ${defaultDisclaimer}`,
    contentType: "social_signal",
    personaId: "vesper-quill",
    personaName: "Vesper Quill",
    hypeLevel: "high_energy",
    language: "English",
    status: "pending_review",
    citations: topThree.map((leader) => ({
      label: `${leader.label} ${leader.handle}`,
      url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
      sourceType: "general_social" as const
    })),
    socialBuzzItems: topThree.map((leader) => ({
      label: `${leader.handle} social voice leaderboard`,
      url: `https://x.com/${leader.handle.replace(/^@/, "")}`,
      sourceType: "general_social" as const
    })),
    riskFlags: ["social_buzz_requires_review", "leaderboard_is_hype_not_verification"],
    confidenceScore: 74,
    createdAt: now.toISOString()
  };
}
