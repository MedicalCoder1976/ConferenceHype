import { env } from "@/lib/env";
import { monitoredSocialTags, monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem } from "@/lib/types";
import type { XVoice } from "@/lib/sources/registry";

function toXUsername(handle: string) {
  return handle.replace(/^@/, "");
}

// Broad ASCO-topic hashtags used by oncologists who won't necessarily tag our brand
const ascoBroadHashtags = [
  "#ASCO26",
  "#ASCO2026",
  "#oncology",
  "#breastcancer",
  "#lungcancer",
  "#colorectalcancer",
  "#NSCLC",
  "#immunotherapy",
  "#ADC",
  "#HER2",
  "#BRAF",
  "#liquidbiopsy",
  "#ctDNA"
];

export function buildXSearchQuery(extraVoices: XVoice[] = []) {
  const brandTagTerms = [
    monitoredSocialTags.primaryHashtag,
    monitoredSocialTags.secondaryHashtag,
    monitoredSocialTags.botHandle,
    monitoredSocialTags.conferenceHypeHandle
  ];
  const voices = [...monitoredXVoices, ...extraVoices].slice(0, 50);
  const voiceTerms = voices.map((voice) => `from:${toXUsername(voice.handle)}`);
  // Brand tags + monitored voices always included.
  // Broad ASCO topic hashtags catch oncologists discussing trials without tagging our brand.
  // Combine as: (brand OR voice) OR (broad ASCO topic tag)
  const brandOrVoice = [...brandTagTerms, ...voiceTerms].join(" OR ");
  const broadTopics = ascoBroadHashtags.join(" OR ");
  return `((${brandOrVoice}) OR (${broadTopics})) -is:retweet lang:en`;
}

export async function fetchTaggedSocialPosts(extraVoices: XVoice[] = []): Promise<IngestedItem[]> {
  const voices = [...monitoredXVoices, ...extraVoices].slice(0, 50);
  if (!env.X_BEARER_TOKEN) {
    return [];
  }

  const query = encodeURIComponent(buildXSearchQuery(extraVoices));
  const response = await fetch(
    `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=100&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,name`,
    {
      headers: {
        Authorization: `Bearer ${env.X_BEARER_TOKEN}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`X recent search failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      text: string;
      author_id?: string;
      created_at?: string;
      public_metrics?: {
        retweet_count?: number;
        reply_count?: number;
        like_count?: number;
        quote_count?: number;
      };
    }>;
    includes?: {
      users?: Array<{ id: string; username?: string; name?: string }>;
    };
  };
  const usersById = new Map(
    (payload.includes?.users ?? []).map((user) => [user.id, user])
  );

  return (payload.data ?? []).map((tweet) => {
    const user = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
    const author = user?.username ? `@${user.username}` : tweet.author_id;
    const watchedVoice = voices.find(
      (voice) => voice.handle.toLowerCase() === author?.toLowerCase()
    );
    const metrics = tweet.public_metrics;
    const engagementScore =
      (metrics?.like_count ?? 0) +
      (metrics?.reply_count ?? 0) * 2 +
      (metrics?.retweet_count ?? 0) * 3 +
      (metrics?.quote_count ?? 0) * 3;

    return {
      id: `x-${tweet.id}`,
      title: watchedVoice
        ? `Monitored X voice: ${watchedVoice.label}`
        : `Tagged social post from ${author ?? "X user"}`,
      url: user?.username
        ? `https://x.com/${user.username}/status/${tweet.id}`
        : `https://x.com/i/web/status/${tweet.id}`,
      excerpt: watchedVoice
        ? `${tweet.text}\n\nMonitored X voice note: ${watchedVoice.note}. Approved for broadcast callout when source-attributed.`
        : tweet.text,
      sourceName: watchedVoice ? "X voice monitor" : "X hashtag monitor",
      sourceType: "general_social" as const,
      rank: 5,
      publishedAt: tweet.created_at,
      author,
      engagementScore
    };
  });
}
