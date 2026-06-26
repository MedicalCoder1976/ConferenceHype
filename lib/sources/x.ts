import { env } from "@/lib/env";
import { monitoredSocialTags, monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem } from "@/lib/types";
import type { XVoice } from "@/lib/sources/registry";

function toXUsername(handle: string) {
  return handle.replace(/^@/, "");
}

type RawTweet = {
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
};

type RawSearchUser = { id: string; username?: string; name?: string };

type RawSearchResponse = {
  data?: RawTweet[];
  includes?: {
    users?: RawSearchUser[];
  };
};

async function searchRecentTweets(query: string, maxResults = 100): Promise<RawSearchResponse> {
  const response = await fetch(
    `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,name`,
    {
      headers: {
        Authorization: `Bearer ${env.X_BEARER_TOKEN}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`X recent search failed: ${response.status}`);
  }
  return (await response.json()) as RawSearchResponse;
}

function engagementScoreFor(tweet: RawTweet) {
  const metrics = tweet.public_metrics;
  return (
    (metrics?.like_count ?? 0) +
    (metrics?.reply_count ?? 0) * 2 +
    (metrics?.retweet_count ?? 0) * 3 +
    (metrics?.quote_count ?? 0) * 3
  );
}

function authorFor(tweet: RawTweet, usersById: Map<string, RawSearchUser>) {
  const user = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
  return { user, author: user?.username ? `@${user.username}` : tweet.author_id };
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
  const payload = await searchRecentTweets(buildXSearchQuery(batch), 100);
  const usersById = new Map(
    (payload.includes?.users ?? []).map((user) => [user.id, user])
  );

  return (payload.data ?? []).map((tweet) => {
    const { user, author } = authorFor(tweet, usersById);
    const watchedVoice = allVoices.find(
      (voice) => voice.handle.toLowerCase() === author?.toLowerCase()
    );
    const engagementScore = engagementScoreFor(tweet);

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

// ---------------------------------------------------------------------------
// Topic-search fallback: for a conference, journal, or newspaper with no
// real official/abstract content this week, find either a post from its own
// account ("the conference/journal/newspaper's own posters") or, failing
// that, the highest-engagement real post from whoever is actually discussing
// it ("prominent social media voices who post about that topic").
// ---------------------------------------------------------------------------

export type TopicSearchEntity = {
  // The riskFlags-style source_id this entity's fallback card should be
  // tagged with, e.g. `conference.id` or `daily-journal-${journal.id}`.
  sourceId: string;
  name: string;
  acronym?: string;
};

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// If this entity's own name/acronym matches an already-monitored voice's
// label, prefer searching its own posts over a generic keyword search.
function ownVoiceFor(entity: TopicSearchEntity): XVoice | undefined {
  const normalizedName = normalizeForMatch(entity.name);
  const normalizedAcronym = entity.acronym ? normalizeForMatch(entity.acronym) : undefined;
  return monitoredXVoices.find((voice) => {
    const normalizedLabel = normalizeForMatch(voice.label);
    return normalizedLabel === normalizedName || (Boolean(normalizedAcronym) && normalizedLabel === normalizedAcronym);
  });
}

// A short, distinctive acronym searches more cleanly than a long full name;
// a too-short acronym (2-3 letters) is too noisy to search on its own.
function topicPhraseFor(entity: TopicSearchEntity) {
  return entity.acronym && entity.acronym.length >= 4 ? entity.acronym : entity.name;
}

function topicTermFor(entity: TopicSearchEntity): string {
  const ownVoice = ownVoiceFor(entity);
  if (ownVoice) {
    return `from:${toXUsername(ownVoice.handle)}`;
  }
  return `"${topicPhraseFor(entity).replace(/"/g, "")}"`;
}

function entityMatchesTweet(entity: TopicSearchEntity, author: string | undefined, text: string) {
  const ownVoice = ownVoiceFor(entity);
  if (ownVoice) {
    return author?.toLowerCase() === ownVoice.handle.toLowerCase();
  }
  return text.toLowerCase().includes(topicPhraseFor(entity).toLowerCase());
}

const TOPIC_QUERY_SUFFIX = ") -is:retweet lang:en";
const MAX_QUERY_LENGTH = 512;

function buildTopicBatches(
  entities: TopicSearchEntity[]
): Array<{ query: string; entities: TopicSearchEntity[] }> {
  const batches: Array<{ query: string; entities: TopicSearchEntity[] }> = [];
  let terms: string[] = [];
  let batchEntities: TopicSearchEntity[] = [];

  const flush = () => {
    if (terms.length === 0) {
      return;
    }
    batches.push({ query: `(${terms.join(" OR ")}${TOPIC_QUERY_SUFFIX}`, entities: batchEntities });
    terms = [];
    batchEntities = [];
  };

  for (const entity of entities) {
    const term = topicTermFor(entity);
    const candidateQuery = `(${[...terms, term].join(" OR ")}${TOPIC_QUERY_SUFFIX}`;
    if (candidateQuery.length > MAX_QUERY_LENGTH && terms.length > 0) {
      flush();
    }
    terms.push(term);
    batchEntities.push(entity);
  }
  flush();
  return batches;
}

export async function searchTopicFallback(
  entities: TopicSearchEntity[]
): Promise<Map<string, IngestedItem>> {
  const bestBySourceId = new Map<string, IngestedItem>();
  if (!env.X_BEARER_TOKEN || entities.length === 0) {
    return bestBySourceId;
  }

  const batches = buildTopicBatches(entities);
  for (const batch of batches) {
    let payload: RawSearchResponse;
    try {
      payload = await searchRecentTweets(batch.query, 50);
    } catch (error) {
      console.warn(`Topic search batch failed: ${String(error)}`);
      continue;
    }
    const usersById = new Map(
      (payload.includes?.users ?? []).map((user) => [user.id, user])
    );
    for (const tweet of payload.data ?? []) {
      const { user, author } = authorFor(tweet, usersById);
      const matched = batch.entities.filter((entity) => entityMatchesTweet(entity, author, tweet.text));
      if (matched.length === 0) {
        continue;
      }
      const engagementScore = engagementScoreFor(tweet);
      for (const entity of matched) {
        const existing = bestBySourceId.get(entity.sourceId);
        if (existing && (existing.engagementScore ?? 0) >= engagementScore) {
          continue;
        }
        bestBySourceId.set(entity.sourceId, {
          id: `x-topic-${tweet.id}`,
          sourceId: entity.sourceId,
          title: `Social callout: ${author ?? "X user"} on ${entity.name}`,
          url: user?.username
            ? `https://x.com/${user.username}/status/${tweet.id}`
            : `https://x.com/i/web/status/${tweet.id}`,
          excerpt: tweet.text,
          sourceName: author ?? "X user",
          sourceType: "general_social",
          rank: 5,
          publishedAt: tweet.created_at,
          author,
          engagementScore
        });
      }
    }
  }
  return bestBySourceId;
}
