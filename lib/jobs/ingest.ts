import {
  monitoredSocialTags,
  sourceRegistry,
  sourceToXVoice,
  type XVoice
} from "@/lib/sources/registry";
import { conferenceLinkedSourceIds, monitoredXVoiceForEntity } from "@/lib/sources/socialLinks";
import { fetchPubMedArticlesForJournal, pubmedArticlesToIngestedItems } from "@/lib/sources/pubmed";
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
import type { DailyCoveragePlan, IngestedItem, MedicalConference, SourceConfig } from "@/lib/types";

// A selected conference's official page, plus any of its registered linked
// sub-pages (program, abstract library, on-site essentials, etc. — matched
// by the `<acronym>-<year>-<page>` naming convention), are pulled in
// automatically. No separate source checkbox is required.
function conferenceLinkedConfiguredSources(
  conference: MedicalConference,
  configuredSources: SourceConfig[]
) {
  return conferenceLinkedSourceIds(conference, configuredSources).map((source) => ({
    ...source,
    id: `daily-conference-${conference.id}-${source.id}`,
    name: `${conference.acronym ?? conference.name}: ${source.name}`,
    enabled: true
  }));
}

export async function runIngestionJob(
  coverageDateOverride?: string,
  planOverride?: DailyCoveragePlan
): Promise<IngestedItem[]> {
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
      planOverride ??
      savedDailyPlan ??
      createDefaultDailyCoveragePlan({
        coverageDate,
        conferences: conferences ?? []
      }),
    journals: journals ?? [],
    conferences: conferences ?? [],
    sources: configuredSources,
    clearLegacyDefaults: !planOverride
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
            id: journal.id,
            name: journal.name,
            url: journal.rssUrl,
            type: "official" as const,
            rank: 1,
            enabled: true
          })),
        ...(conferences ?? [])
          .filter((conference) => dailyPlan.conferenceIds.includes(conference.id))
          .flatMap((conference) => [
            {
              id: conference.id,
              name: conference.name,
              url: conference.officialUrl,
              type: "official" as const,
              rank: 1,
              enabled: true
            },
            ...conferenceLinkedConfiguredSources(conference, configuredSources)
          ]),
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
  const journalById = new Map((journals ?? []).map((journal) => [journal.id, journal]));
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
      // Some flagship journals do not expose a stable publisher RSS endpoint.
      // Their catalog entry uses an explicit PubMed [Journal] query URL so the
      // existing ingestion path still receives authoritative abstracts without
      // falling through to page scraping or X. This remains serialized and
      // rate-limited by lib/sources/pubmed.ts.
      if (source.url.includes("pubmed.ncbi.nlm.nih.gov/") && journalById.has(source.id)) {
        const journal = journalById.get(source.id)!;
        const articles = await fetchPubMedArticlesForJournal(journal.name);
        return pubmedArticlesToIngestedItems(articles, {
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          rank: source.rank
        });
      }
      if (isRssSource(source)) {
        try {
          return await fetchRssSource(source);
        } catch (error) {
          // Some publishers (seen so far: Wiley, AHA) block GitHub Actions'
          // IP ranges with a 403 even though the same feed resolves fine
          // from a normal machine. Only for sources that are genuinely a
          // catalog journal (matched by id, not a heuristic on name/URL) --
          // conferences and newspapers still fail the normal way -- fall
          // back to a direct PubMed [Journal] search for that journal's
          // last ~90 days of output instead of losing the source entirely.
          const journal = journalById.get(source.id);
          if (!journal) {
            throw error;
          }
          const articles = await fetchPubMedArticlesForJournal(journal.name);
          if (articles.length === 0) {
            throw error;
          }
          return pubmedArticlesToIngestedItems(articles, {
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            rank: source.rank
          });
        }
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

  // Every selected conference, journal, or source auto-links to its
  // monitored X voice (if one is configured) so social posts from that voice
  // count toward the selection — completing the official-pages → abstracts →
  // socials cascade without a separate checkbox for the social step.
  const selectedConferences = (conferences ?? []).filter((conference) =>
    dailyPlan.conferenceIds.includes(conference.id)
  );
  const selectedJournals = (journals ?? []).filter((journal) =>
    dailyPlan.journalIds.includes(journal.id)
  );
  const selectedRealSourceIds = dailyPlan.sourceIds.filter((id) => !id.startsWith("daily-"));
  const linkedXVoiceMatches = [
    ...selectedConferences.flatMap((conference) => {
      const voice = monitoredXVoiceForEntity(conference);
      return voice
        ? [
            {
              handle: voice.handle.toLowerCase(),
              sourceId: `daily-conference-${conference.id}-x-${voice.handle.slice(1).toLowerCase()}`
            }
          ]
        : [];
    }),
    ...selectedJournals.flatMap((journal) => {
      const voice = monitoredXVoiceForEntity(journal);
      return voice
        ? [
            {
              handle: voice.handle.toLowerCase(),
              sourceId: `daily-journal-${journal.id}-x-${voice.handle.slice(1).toLowerCase()}`
            }
          ]
        : [];
    }),
    ...selectedRealSourceIds.flatMap((sourceId) => {
      const voice = monitoredXVoiceForEntity({ id: sourceId });
      return voice
        ? [{ handle: voice.handle.toLowerCase(), sourceId: `${sourceId}-x-${voice.handle.slice(1).toLowerCase()}` }]
        : [];
    })
  ];

  const rankedItems = batches
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .map((item) => {
      if (item.sourceType !== "general_social" || !item.author) {
        return item;
      }
      const match = linkedXVoiceMatches.find(({ handle }) => handle === item.author?.toLowerCase());
      return match ? { ...item, sourceId: match.sourceId } : item;
    })
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
