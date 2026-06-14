import { env } from "@/lib/env";
import { monitoredSocialTags, monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem } from "@/lib/types";
import type { XVoice } from "@/lib/sources/registry";

function toXUsername(handle: string) {
  return handle.replace(/^@/, "");
}

export function buildXSearchQuery(extraVoices: XVoice[] = []) {
  // X API Basic tier caps queries at 512 characters.
  // Keep the query tight: active conference hashtags + monitored voice follows only.
  // Broad clinical hashtags (#oncology, #breastcancer etc.) are dropped — they
  // blow the budget and pull in noise unrelated to the conference.
  const coreHashtags = [
    monitoredSocialTags.primaryHashtag,
    monitoredSocialTags.secondaryHashtag,
    monitoredSocialTags.conferenceHashtag,
    monitoredSocialTags.conferenceYearHashtag
  ];

  const allVoices = [...monitoredXVoices, ...extraVoices];
  const voiceTerms = allVoices.map((v) => `from:${toXUsername(v.handle)}`);

  // Build query and trim voices to stay under the 512-char limit
  const allTerms = [...coreHashtags, ...voiceTerms];
  const suffix = ") -is:retweet lang:en";
  let inner = allTerms.join(" OR ");
  while (`(${inner}${suffix}`.length > 512 && voiceTerms.length > 0) {
    voiceTerms.pop();
    inner = [...coreHashtags, ...voiceTerms].join(" OR ");
  }

  return `(${inner}${suffix}`;
}

export async function fetchTaggedSocialPosts(extraVoices: XVoice[] = []): Promise<IngestedItem[]> {
  const voices = Array.from(
    new Map(
      [...monitoredXVoices, ...extraVoices].map((voice) => [
        voice.handle.toLowerCase(),
        voice
      ])
    ).values()
  );
  if (!env.X_BEARER_TOKEN) {
    return [];
  }

  // Rotate four voice batches per 15-minute ingest cycle. This keeps requests
  // under X's 512-character query limit while eventually covering large
  // specialty directories without exhausting the API in one run.
  const batchSize = 12;
  const batches = Array.from(
    { length: Math.ceil(voices.length / batchSize) },
    (_, index) => voices.slice(index * batchSize, (index + 1) * batchSize)
  );
  const rotation = Math.floor(Date.now() / (15 * 60 * 1000));
  const selectedBatches = Array.from(
    { length: Math.min(4, batches.length) },
    (_, index) => batches[(rotation + index) % batches.length]
  );
  const results = await Promise.allSettled(
    selectedBatches.map((batch) => fetchXBatch(batch, voices))
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed && results.every((result) => result.status === "rejected")) {
    throw failed.reason;
  }
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function fetchXBatch(batch: XVoice[], allVoices: XVoice[]): Promise<IngestedItem[]> {
  const query = encodeURIComponent(buildXSearchQuery(batch));
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
    const watchedVoice = allVoices.find(
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
