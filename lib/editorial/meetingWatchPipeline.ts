import OpenAI from "openai";
import { env } from "@/lib/env";
import { fetchArticleLinks, fetchPageSummary } from "@/lib/sources/scraper";
import { generateCardsFromSource } from "@/lib/generation/llm";
import type { IngestedItem, Segment, SourceConfig } from "@/lib/types";

const MIN_CARD_COUNT = 20;
const FETCH_CONCURRENCY = 5;
const MAX_CANDIDATES = 50;

export type CuratedMeetingArticle = {
  url: string;
  title: string;
  author?: string;
  sourceName: string;
  facts: string;
  cardCount: number;
  cluster: string;
};

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R | undefined>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      try {
        const result = await fn(current);
        if (result !== undefined) results.push(result);
      } catch (error) {
        console.warn(`Meeting Watch discovery: skipping a candidate after a fetch error: ${String(error)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Fetch the seed URL, harvest same-hostname candidate article links (cheap,
// deterministic -- lib/sources/scraper.ts's fetchArticleLinks), fetch each
// candidate's real text, then one LLM pass identifies genuinely distinct
// real stories (collapsing same-story reposts across different issue
// dates -- the same judgment call two research agents made by hand for the
// first ASH broadcast), estimates how many ~75s cards each real story's
// content actually supports (1-3), and clusters them by theme so episodes
// come out topically coherent rather than a random grab-bag. Stops
// preferring richer/more distinct stories once the curated set comfortably
// covers targetEpisodeCount * ~22 cards.
export async function discoverMeetingWatchArticles({
  seedUrl,
  meetingLabel,
  episodeCount
}: {
  seedUrl: string;
  meetingLabel: string;
  episodeCount: number;
}): Promise<CuratedMeetingArticle[]> {
  if (!env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required to discover Meeting Watch articles.");
  }
  const targetCardCount = episodeCount * MIN_CARD_COUNT;
  const seedSource: SourceConfig = {
    id: `meeting-watch-seed-${Date.now()}`,
    name: meetingLabel,
    url: seedUrl,
    type: "media",
    rank: 2,
    enabled: true
  };

  const [seedSummary, candidateLinks] = await Promise.all([
    fetchPageSummary(seedSource).catch(() => [] as IngestedItem[]),
    fetchArticleLinks(seedUrl, MAX_CANDIDATES)
  ]);

  const candidateItems = await mapWithConcurrency(candidateLinks, FETCH_CONCURRENCY, async (url) => {
    const [summary] = await fetchPageSummary({ id: url, name: meetingLabel, url, type: "media", rank: 2, enabled: true });
    return summary;
  });

  const allCandidates = [...seedSummary, ...candidateItems].filter((item) => item.excerpt && item.excerpt.length > 80);
  if (allCandidates.length === 0) {
    throw new Error(`No readable article content was found at or linked from ${seedUrl}.`);
  }

  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const candidateText = allCandidates
    .map((item, index) => `${index + 1}. URL: ${item.url}\nTitle: ${item.title}\nExcerpt: ${item.excerpt}`)
    .join("\n\n");
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [{
      role: "user",
      content: `These are candidate articles scraped from and linked around ${seedUrl}, for a "${meetingLabel}" broadcast. Many of these are the SAME underlying story reposted across different issue dates or news sections -- identify and collapse duplicates, keeping only the most complete version of each genuinely distinct real story. Discard anything that isn't real substantive content (navigation, ads, unrelated site sections, video-only pages with no real text).

For each genuinely distinct real story you keep, estimate how many ~75-second spoken cards its real content actually supports (1 to 3 -- only if the article states that many genuinely separate facts, like design/population, a primary result with real numbers, and a safety/implication point; do not inflate this), and assign a short thematic cluster label (e.g. a disease/topic grouping) so multiple stories on the same theme can be grouped into one broadcast episode together.

Select enough distinct stories, preferring richer ones, to comfortably reach a total of about ${targetCardCount} cards across all selected stories combined.

Return JSON: {"articles":[{"url":"...","title":"...","author":"...","facts":"a few sentences of the real facts from the excerpt, suitable for writing spoken cards from","cardCount":2,"cluster":"..."}]}

Candidates:
${candidateText}`
    }],
    response_format: { type: "json_object" },
    temperature: 0.2
  });
  const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as {
    articles?: Array<{ url?: string; title?: string; author?: string; facts?: string; cardCount?: number; cluster?: string }>;
  };
  const byUrl = new Map(allCandidates.map((item) => [item.url, item]));
  const curated = (parsed.articles ?? [])
    .filter((article) => article.url && article.title && article.facts && byUrl.has(article.url))
    .map((article) => ({
      url: article.url!,
      title: article.title!,
      author: article.author,
      sourceName: byUrl.get(article.url!)!.sourceName,
      facts: article.facts!,
      cardCount: Math.max(1, Math.min(3, Math.round(article.cardCount ?? 1))),
      cluster: article.cluster?.trim() || "General"
    }));
  if (curated.length === 0) {
    throw new Error(`The discovery pass found no genuinely distinct, substantive articles at ${seedUrl}.`);
  }
  const totalCards = curated.reduce((sum, article) => sum + article.cardCount, 0);
  if (totalCards < episodeCount * MIN_CARD_COUNT) {
    console.warn(
      `Meeting Watch discovery for ${seedUrl} only found ${totalCards} real cards' worth of content across ${curated.length} articles, short of the ${episodeCount * MIN_CARD_COUNT} target for ${episodeCount} episode(s). Proceeding with what's real rather than padding.`
    );
  }
  return curated;
}

function toSource(article: CuratedMeetingArticle): IngestedItem {
  return {
    id: `meeting-watch-${article.url}`,
    title: article.title,
    url: article.url,
    excerpt: article.facts,
    sourceName: article.sourceName,
    author: article.author,
    sourceType: "media",
    rank: 2,
    publishedAt: new Date().toISOString()
  };
}

// Groups curated articles into episodeCount buckets, keeping same-cluster
// articles together where possible and otherwise balancing total card
// count across episodes (greedy: largest-cluster-first onto the
// currently-lightest episode) so no single episode is left far short.
export function splitArticlesIntoEpisodes(
  articles: CuratedMeetingArticle[],
  episodeCount: number
): CuratedMeetingArticle[][] {
  const clusters = new Map<string, CuratedMeetingArticle[]>();
  for (const article of articles) {
    const bucket = clusters.get(article.cluster) ?? [];
    bucket.push(article);
    clusters.set(article.cluster, bucket);
  }
  const clusterGroups = Array.from(clusters.values()).sort(
    (a, b) => b.reduce((sum, item) => sum + item.cardCount, 0) - a.reduce((sum, item) => sum + item.cardCount, 0)
  );
  const episodes: CuratedMeetingArticle[][] = Array.from({ length: episodeCount }, () => []);
  const episodeTotals = new Array(episodeCount).fill(0);
  for (const group of clusterGroups) {
    const lightestIndex = episodeTotals.indexOf(Math.min(...episodeTotals));
    episodes[lightestIndex].push(...group);
    episodeTotals[lightestIndex] += group.reduce((sum, item) => sum + item.cardCount, 0);
  }
  return episodes;
}

export async function generateCardsForEpisode(articles: CuratedMeetingArticle[], meetingLabel: string): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const article of articles) {
    const cards = await generateCardsFromSource({
      source: toSource(article),
      cardCount: article.cardCount,
      meetingLabel
    });
    segments.push(...cards);
  }
  return segments;
}
