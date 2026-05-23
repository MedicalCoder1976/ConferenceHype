import {
  monitoredSocialTags,
  sourceRegistry,
  sourceToXVoice,
  type XVoice
} from "@/lib/sources/registry";
import { fetchRssSource } from "@/lib/sources/rss";
import { fetchPageSummary } from "@/lib/sources/scraper";
import { fetchTaggedSocialPosts } from "@/lib/sources/x";
import { isRelevantItem } from "@/lib/sources/relevance";
import {
  getSourcesFromDb,
  saveIngestedItemsToDb,
  upsertSourcesToDb
} from "@/lib/db";
import type { IngestedItem } from "@/lib/types";

export async function runIngestionJob(): Promise<IngestedItem[]> {
  await upsertSourcesToDb();
  const configuredSources = (await getSourcesFromDb()) ?? sourceRegistry;
  const enabled = configuredSources.filter((source) => source.enabled);
  const extraXVoices = enabled
    .map(sourceToXVoice)
    .filter((voice): voice is XVoice => Boolean(voice));
  const batches = await Promise.allSettled(
    enabled.map(async (source) => {
      const isXSearchSource =
        source.id === "asco-hype-tags" ||
        source.name.toLowerCase().includes("audience tags") ||
        source.url.includes(monitoredSocialTags.primaryHashtag);
      if (isXSearchSource) {
        return fetchTaggedSocialPosts(extraXVoices);
      }
      if (sourceToXVoice(source)) {
        return [];
      }
      if (source.url.includes("rss") || source.url.includes("feed")) {
        return fetchRssSource(source);
      }
      return fetchPageSummary(source);
    })
  );

  const rankedItems = batches
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter(isRelevantItem)
    .sort((a, b) => a.rank - b.rank);
  const dedupedItems = Array.from(
    new Map(rankedItems.map((item) => [`${item.url}|${item.title}`, item])).values()
  ).slice(0, 40);
  await saveIngestedItemsToDb(dedupedItems);
  return dedupedItems;
}
