import { env } from "@/lib/env";
import { monitoredSocialTags, monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem } from "@/lib/types";

function toXUsername(handle: string) {
  return handle.replace(/^@/, "");
}

export function buildXSearchQuery() {
  const tagTerms = [
    monitoredSocialTags.primaryHashtag,
    monitoredSocialTags.secondaryHashtag,
    monitoredSocialTags.conferenceHashtag,
    monitoredSocialTags.botHandle
  ];
  const voiceTerms = monitoredXVoices.map((voice) => `from:${toXUsername(voice.handle)}`);
  return `(${[...tagTerms, ...voiceTerms].join(" OR ")}) -is:retweet lang:en`;
}

export async function fetchTaggedSocialPosts(): Promise<IngestedItem[]> {
  if (!env.X_BEARER_TOKEN) {
    return [
      {
        id: "mock-social-tag",
        title: "Mock tagged post: ASCO Hype audience signal",
        url: "https://x.com/hashtag/ASCOHype",
        excerpt:
          "A sample audience post tagged with #ASCOHype or #ASCO26. Configure X_BEARER_TOKEN to ingest real tagged posts, bot mentions, monitored X voices, commentary ideas, and audience snack or coffee recommendations from the Exhibitor Hall.",
        sourceName: "X hashtag and voice monitor",
        sourceType: "general_social",
        rank: 5,
        author: monitoredSocialTags.botHandle
      },
      {
        id: "mock-x-voice",
        title: "Mock monitored X voice: ASCO meeting signal",
        url: "https://x.com/ASCO",
        excerpt:
          "A sample monitored X voice item. Posts from watched handles can be called out as commentary ideas only after operator review.",
        sourceName: "X voice monitor",
        sourceType: "general_social",
        rank: 5,
        author: "@ASCO"
      }
    ];
  }

  const query = encodeURIComponent(buildXSearchQuery());
  const response = await fetch(
    `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=20&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,name`,
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
    data?: Array<{ id: string; text: string; author_id?: string; created_at?: string }>;
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
    const watchedVoice = monitoredXVoices.find(
      (voice) => voice.handle.toLowerCase() === author?.toLowerCase()
    );

    return {
      id: `x-${tweet.id}`,
      title: watchedVoice
        ? `Monitored X voice: ${watchedVoice.label}`
        : `Tagged social post from ${author ?? "X user"}`,
      url: user?.username
        ? `https://x.com/${user.username}/status/${tweet.id}`
        : `https://x.com/i/web/status/${tweet.id}`,
      excerpt: watchedVoice
        ? `${tweet.text}\n\nMonitored X voice note: ${watchedVoice.note}. Treat as a callout idea until reviewed.`
        : tweet.text,
      sourceName: watchedVoice ? "X voice monitor" : "X hashtag monitor",
      sourceType: "general_social" as const,
      rank: 5,
      publishedAt: tweet.created_at,
      author
    };
  });
}
