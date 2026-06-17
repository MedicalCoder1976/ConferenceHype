import {
  monitoredSocialTags,
  sourceRegistry,
  sourceToXVoice,
  type XVoice
} from "@/lib/sources/registry";
import { fetchRssSource, isRssSource } from "@/lib/sources/rss";
import { fetchPageSummary } from "@/lib/sources/scraper";
import { fetchEhaSource } from "@/lib/sources/eha";
import { fetchTaggedSocialPosts } from "@/lib/sources/x";
import { isRelevantItem } from "@/lib/sources/relevance";
import {
  getSourcesFromDb,
  getSpecialtyXVoicesFromDb,
  getDailyCoveragePlanFromDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  saveIngestedItemsToDb,
  upsertSourcesToDb
} from "@/lib/db";
import {
  createDefaultDailyCoveragePlan,
  normalizeLegacyDailyCoverageDefaults
} from "@/lib/dailyCoverage";
import type { IngestedItem } from "@/lib/types";

export async function runIngestionJob(coverageDateOverride?: string): Promise<IngestedItem[]> {
  await upsertSourcesToDb();
  const configuredSources = (await getSourcesFromDb()) ?? sourceRegistry;
  const coverageDate =
    coverageDateOverride ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  const [savedDailyPlan, journals, conferences] = await Promise.all([
    getDailyCoveragePlanFromDb(coverageDate),
    getOncologyJournalsFromDb(),
    getMedicalConferencesFromDb()
  ]);
  const dailyPlan = normalizeLegacyDailyCoverageDefaults({
    plan:
      savedDailyPlan ??
      createDefaultDailyCoveragePlan({
        coverageDate,
        conferences: conferences ?? []
      }),
    journals: journals ?? [],
    sources: configuredSources
  });
  const specialtyVoices = (await getSpecialtyXVoicesFromDb()) ?? [];
  const selectedConfiguredSources = configuredSources.filter(
    (source) =>
      source.enabled &&
      dailyPlan.sourceIds.includes(source.id) &&
      (dailyPlan?.breakingNewsEnabled !== false || source.type !== "general_social")
  );
  const additionalSources = dailyPlan
    ? [
        ...(journals ?? [])
          .filter((journal) => dailyPlan.journalIds.includes(journal.id))
          .map((journal) => ({
            id: `daily-journal-${journal.id}`,
            name: journal.name,
            url: journal.rssUrl,
            type: "official" as const,
            rank: 1,
            enabled: true
          })),
        ...(conferences ?? [])
          .filter((conference) => dailyPlan.conferenceIds.includes(conference.id))
          .map((conference) => ({
            id: `daily-conference-${conference.id}`,
            name: conference.name,
            url: conference.officialUrl,
            type: "official" as const,
            rank: 1,
            enabled: true
          })),
        ...dailyPlan.customItems
          .filter((item) => item.url)
          .map((item) => ({
            id: `daily-custom-${item.id}`,
            name: item.label,
            url: item.url!,
            type: "manual" as const,
            rank: 1,
            enabled: true
          }))
      ]
    : [];
  const enabled = Array.from(
    new Map(
      [...selectedConfiguredSources, ...additionalSources].map((source) => [
        source.url,
        source
      ])
    ).values()
  );
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
      if (source.type === "manual" && !/^https?:\/\//i.test(source.url)) {
        return [];
      }
      const isXSearchSource =
        source.id === "conferencehype-tags" ||
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
      if (isRssSource(source)) {
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
    .map((item) =>
      item.sourceId?.startsWith("daily-") ? { ...item, sourceId: undefined } : item
    )
    .filter(isRelevantItem)
    .filter((item) => {
      if (!dailyPlan?.exclusions.length) return true;
      const text = `${item.title} ${item.excerpt} ${item.sourceName}`.toLowerCase();
      return !dailyPlan.exclusions.some((term) => text.includes(term.toLowerCase()));
    })
    .sort((a, b) => {
      const priorityScore = (item: IngestedItem) => {
        const text = `${item.title} ${item.excerpt}`.toLowerCase();
        return (dailyPlan?.priorityTopics ?? []).filter((term) =>
          text.includes(term.toLowerCase())
        ).length;
      };
      const priorityDifference = priorityScore(b) - priorityScore(a);
      if (priorityDifference !== 0) return priorityDifference;
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
