import {
  monitoredSocialTags,
  sourceRegistry,
  sourceToXVoice,
  type XVoice
} from "@/lib/sources/registry";
import { fetchRssSource } from "@/lib/sources/rss";
import { fetchPageSummary } from "@/lib/sources/scraper";
import { fetchEhaSource } from "@/lib/sources/eha";
import { fetchTaggedSocialPosts } from "@/lib/sources/x";
import { isRelevantItem } from "@/lib/sources/relevance";
import {
  getSourcesFromDb,
  getSpecialtyXVoicesFromDb,
  saveIngestedItemsToDb,
  upsertSourcesToDb
} from "@/lib/db";
import type { IngestedItem } from "@/lib/types";

export async function runIngestionJob(): Promise<IngestedItem[]> {
  await upsertSourcesToDb();
  const configuredSources = (await getSourcesFromDb()) ?? sourceRegistry;
  const specialtyVoices = (await getSpecialtyXVoicesFromDb()) ?? [];
  const enabled = configuredSources.filter((source) => source.enabled);
  const extraXVoices = enabled
    .map(sourceToXVoice)
    .filter((voice): voice is XVoice => Boolean(voice));
  const specialtyXVoices = specialtyVoices
    .filter((voice) => voice.enabled)
    .map((voice) => ({
      label: voice.label,
      handle: voice.handle,
      note: `${voice.specialty}: ${voice.note}`
    }));
  const batches = await Promise.allSettled(
    enabled.map(async (source) => {
      if (source.type === "manual") {
        return [];
      }
      const isXSearchSource =
        source.id === "asco-hype-tags" ||
        source.name.toLowerCase().includes("audience tags") ||
        source.url.includes(monitoredSocialTags.primaryHashtag);
      if (isXSearchSource) {
        return fetchTaggedSocialPosts([...extraXVoices, ...specialtyXVoices]);
      }
      if (sourceToXVoice(source)) {
        return [];
      }
      if (
        source.url.includes("library.ehaweb.org/eha/") ||
        source.url.includes("eha2026-on-site-essentials") ||
        source.url.includes("eha2026-sponsorship-opportunities") ||
        source.url.includes("eha2026-media-registration")
      ) {
        return fetchEhaSource(source);
      }
      if (source.url.includes("rss") || source.url.includes("feed")) {
        return fetchRssSource(source);
      }
      return fetchPageSummary(source);
    })
  );

  // Surface fetch errors so they are visible in GitHub Actions logs.
  batches.forEach((result, i) => {
    if (result.status === "rejected") {
      const sourceId = enabled[i]?.id ?? `source-${i}`;
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "source fetch failed",
          source: sourceId,
          error: String((result.reason as Error)?.message ?? result.reason)
        })
      );
    }
  });

  const rankedItems = batches
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter(isRelevantItem)
    .sort((a, b) => {
      if (a.sourceType.includes("social") && b.sourceType.includes("social")) {
        return (b.engagementScore ?? 0) - (a.engagementScore ?? 0);
      }
      return a.rank - b.rank;
    });
  const dedupedItems = Array.from(
    new Map(rankedItems.map((item) => [`${item.url}|${item.title}`, item])).values()
  ).slice(0, 120);
  await saveIngestedItemsToDb(dedupedItems);
  return dedupedItems;
}
