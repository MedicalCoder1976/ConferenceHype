import { randomUUID } from "node:crypto";
import { generateSegmentFromSources } from "@/lib/generation/llm";
import { runIngestionJob } from "@/lib/jobs/ingest";
import { buildScheduleFallbackSegment } from "@/lib/jobs/upcomingEvents";
import {
  addXFollowSourceToDb,
  getBlacklistedXHandlesFromDb,
  getXFollowVoicesFromDb,
  saveGeneratedSegmentsToDb
} from "@/lib/db";
import {
  buildSocialVoiceCompetitionSegment,
  buildSocialVoiceLeaderboard,
  shouldRunSocialVoiceCompetition
} from "@/lib/social/leaderboard";
import type { IngestedItem, Segment, SocialVoiceLeader } from "@/lib/types";

const TOP_SOCIAL_NARRATIVE_TARGET = 50;
const SOURCE_CARD_TARGET = 72;

async function generateOrScheduleFallback(
  generate: () => Promise<Segment>,
  now: Date
) {
  try {
    return await generate();
  } catch {
    return {
      ...buildScheduleFallbackSegment(now),
      id: `schedule-fallback-${randomUUID()}`,
      title: "Schedule fallback: ASCO program spine",
      summary:
        "LLM script generation did not produce a usable real script, so broadcast defaults to the official ASCO schedule spine with no mock data."
    };
  }
}

function dedupeScheduleFallbacks(segments: Segment[]) {
  let scheduleFallbackSeen = false;
  return segments.filter((segment) => {
    const isScheduleFallback = segment.riskFlags.includes("no_llm_schedule_spine");
    if (!isScheduleFallback) {
      return true;
    }
    if (scheduleFallbackSeen) {
      return false;
    }
    scheduleFallbackSeen = true;
    return true;
  });
}

async function generateOrNull(generate: () => Promise<Segment>) {
  try {
    return await generate();
  } catch {
    return null;
  }
}

function isXVoiceCallout(item: IngestedItem) {
  return (
    item.sourceName === "X voice monitor" ||
    item.title.toLowerCase().startsWith("monitored x voice:")
  );
}

function itemText(item: IngestedItem) {
  return `${item.title}\n${item.excerpt}\n${item.sourceName}`.toLowerCase();
}

function isExhibitorChatter(item: IngestedItem) {
  const text = itemText(item);
  return /\b(exhibitor|exhibit hall|booth|sponsor|product showcase|industry floor|company showcase|commercial|demo|showcase)\b/i.test(
    text
  );
}

function isAbstractChatter(item: IngestedItem) {
  const text = itemText(item);
  return /\b(abstract|oral|poster|trial|phase\s?[123]|orr|pfs|os|mrd|ctdna|biomarker|nsclc|breast cancer|prostate|myeloma|lymphoma|data|results)\b/i.test(
    text
  );
}

function sourceLabel(item: IngestedItem) {
  return `${item.sourceName}: ${item.title}. ${item.excerpt}`.slice(0, 280);
}

function sourceSummary(item: IngestedItem) {
  const excerpt = item.excerpt.trim();
  if (!excerpt) {
    return `${item.sourceName} published or posted this ASCO-related item for review.`;
  }
  return excerpt.length > 320 ? `${excerpt.slice(0, 317)}...` : excerpt;
}

function sourcePriority(item: IngestedItem) {
  const text = `${item.sourceName} ${item.title} ${item.url}`.toLowerCase();
  if (text.includes("asco post") || text.includes("ascopost.com")) {
    return 0;
  }
  if (item.sourceType.includes("social")) {
    return 1;
  }
  if (text.includes("onclive")) {
    return 2;
  }
  if (text.includes("stat news") || text.includes("statnews.com")) {
    return 9;
  }
  return 4;
}

function sourceCardPersona(index: number) {
  const personas = [
    { id: "vesper-quill", name: "Vesper Quill", hype: "high_energy" as const },
    { id: "tumorcrusher", name: "TumorCrusher", hype: "standard" as const },
    { id: "echo-sage", name: "Echo Sage", hype: "restrained" as const }
  ];
  return personas[index % personas.length];
}

function sourceCardType(item: IngestedItem) {
  if (isExhibitorChatter(item)) {
    return "industry_floor" as const;
  }
  if (isAbstractChatter(item)) {
    return "abstract_buzz" as const;
  }
  if (item.sourceType.includes("social")) {
    return "social_signal" as const;
  }
  return "media_roundup" as const;
}

function buildSourceCard(item: IngestedItem, now: Date, index: number, alternate = false): Segment {
  const persona = sourceCardPersona(index);
  const contentType = sourceCardType(item);
  const isSocialNarrative = item.sourceType.includes("social");
  const citation = {
    label: sourceLabel(item),
    url: item.url,
    sourceType: isSocialNarrative ? ("verified_social" as const) : item.sourceType
  };
  const summary = sourceSummary(item);
  const alternateLine = alternate
    ? "This is a backup angle for the same source item, ready only if the primary version is not already in the hour."
    : "";
  const script = [
    isSocialNarrative
      ? `${persona.name} here with a source-backed X narrative from ${item.author ?? item.sourceName}.`
      : `${persona.name} here with a source-backed ASCO update from ${item.sourceName}.`,
    `The item is titled "${item.title}".`,
    summary,
    alternateLine
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: `latest-source-${randomUUID()}`,
    title: `${alternate ? "Alternate angle - " : ""}${item.sourceName}: ${item.title}`.slice(0, 140),
    summary,
    script,
    contentType,
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: persona.hype,
    language: "en",
    status:
      !alternate &&
      (isXVoiceCallout(item) || sourcePriority(item) === 0)
        ? "approved"
        : "pending_review",
    citations: [citation],
    socialBuzzItems: item.sourceType.includes("social") ? [citation] : [],
    riskFlags: [
      "rss_latest_source_card",
      "source_backed_review_pool",
      ...(alternate ? ["alternate_angle_do_not_repeat"] : [])
    ],
    confidenceScore: item.sourceType === "official" ? 94 : item.sourceType === "media" ? 88 : 82,
    createdAt: now.toISOString(),
    approvedAt:
      !alternate &&
      (isXVoiceCallout(item) || sourcePriority(item) === 0)
        ? now.toISOString()
        : undefined
  };
}

function buildLatestSourceCards(items: IngestedItem[], now: Date) {
  const seen = new Set<string>();
  const eligibleItems = items
    .filter((item) => {
      const key = `${item.url || item.title}`.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return ["official", "media", "company", "verified_social", "general_social"].includes(item.sourceType);
    })
    .sort((a, b) => {
      const priorityDelta = sourcePriority(a) - sourcePriority(b);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      if (a.sourceType.includes("social") && b.sourceType.includes("social")) {
        return (b.engagementScore ?? 0) - (a.engagementScore ?? 0);
      }
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });
  const topSocialItems = eligibleItems
    .filter((item) => item.sourceType.includes("social"))
    .slice(0, TOP_SOCIAL_NARRATIVE_TARGET);
  const primaryItems = [
    ...eligibleItems.filter((item) => sourcePriority(item) === 0),
    ...topSocialItems,
    ...eligibleItems.filter(
      (item) => sourcePriority(item) !== 0 && !item.sourceType.includes("social")
    )
  ];
  const primaryCards = primaryItems
    .slice(0, SOURCE_CARD_TARGET)
    .map((item, index) => buildSourceCard(item, now, index));
  return primaryCards;
}

function topTractionLeaders(leaders: SocialVoiceLeader[], blacklistedHandles: string[] = []) {
  const blacklisted = new Set(blacklistedHandles.map((handle) => handle.toLowerCase()));
  return leaders
    .filter((leader) => leader.mentions > 0 && !blacklisted.has(leader.handle.toLowerCase()))
    .slice(0, TOP_SOCIAL_NARRATIVE_TARGET);
}

async function addCompetitionLeadersToXCallouts(
  leaders: SocialVoiceLeader[],
  blacklistedHandles: string[] = []
) {
  await Promise.all(
    topTractionLeaders(leaders, blacklistedHandles).map((leader) =>
      addXFollowSourceToDb({
        handle: leader.handle,
        label: leader.label,
        note: `auto-added from ASCO social voice traction; score ${leader.score}; ${leader.momentum} momentum`
      })
    )
  );
}

export async function runGenerateJob() {
  const now = new Date();
  const items = await runIngestionJob();
  const socialItems = items.filter((item) => item.sourceType.includes("social"));
  const xVoiceItems = socialItems.filter(isXVoiceCallout);
  const reviewSocialItems = socialItems.filter((item) => !isXVoiceCallout(item));
  const primaryItems = items.filter((item) => !item.sourceType.includes("social"));
  const abstractSources = [...primaryItems, ...xVoiceItems].filter(isAbstractChatter);
  const exhibitorSources = [...primaryItems, ...xVoiceItems].filter(isExhibitorChatter);
  const otherXVoiceItems = xVoiceItems.filter(
    (item) => !isAbstractChatter(item) && !isExhibitorChatter(item)
  );
  const otherReviewSocialItems = reviewSocialItems.filter(
    (item) => !isAbstractChatter(item) && !isExhibitorChatter(item)
  );
  const otherPrimarySources = primaryItems.filter(
    (item) => !isAbstractChatter(item) && !isExhibitorChatter(item)
  );

  const generatedSegments = dedupeScheduleFallbacks(
    (
      await Promise.all([
      generateOrScheduleFallback(
        () =>
          generateSegmentFromSources({
            sources: (abstractSources.length ? abstractSources : otherPrimarySources).slice(0, 8),
            personaId: "echo-sage",
            hypeLevel: "standard",
            contentType: abstractSources.length ? "abstract_buzz" : "media_roundup",
            status:
              abstractSources.length &&
              xVoiceItems.some((item) => abstractSources.includes(item))
                ? "approved"
                : undefined,
            editorialInstruction: abstractSources.length
              ? "Create an abstract/science chatter segment only. Focus on abstracts, trials, posters, data, biomarkers, disease tracks, presenters, and source-attributed scientific discussion. Monitored X voice material may enter the presentation sequence when source-attributed. Do not include exhibitor booths, sponsor copy, product-floor chatter, or commercial showcases."
              : "Create a media/source roundup segment only. Do not mix in exhibitor booths, sponsor copy, product-floor chatter, or commercial showcases."
          }),
        now
      ),
      exhibitorSources.length
        ? generateOrNull(() =>
            generateSegmentFromSources({
              sources: exhibitorSources.slice(0, 8),
              personaId: "vesper-quill",
              hypeLevel: "high_energy",
              contentType: "industry_floor",
              status: xVoiceItems.some((item) => exhibitorSources.includes(item))
                ? "approved"
                : "pending_review",
              editorialInstruction:
                "Create an exhibitor/floor chatter segment only. Focus on booths, exhibitor hall items, sponsor messages, product showcases, company floor activity, and operator/source-attributed industry-floor notes. Do not include abstract data, oral abstract results, poster science, trial endpoints, or disease-track data interpretation."
            })
          )
        : Promise.resolve(null),
      otherXVoiceItems.length || otherReviewSocialItems.length
        ? generateOrNull(() =>
            generateSegmentFromSources({
              sources: otherXVoiceItems.length
                ? otherXVoiceItems.slice(0, 8)
                : otherReviewSocialItems.slice(0, 8),
              personaId: "vesper-quill",
              hypeLevel: "high_energy",
              status: otherXVoiceItems.length ? "approved" : "pending_review",
              editorialInstruction:
                otherXVoiceItems.length
                  ? "This is a monitored X voice callout segment for non-abstract, non-exhibitor items only. It may enter the presentation sequence without manual approval when source-attributed. Call out the handle and source name clearly, narrate the material directly, and avoid full disclaimer repetition. Do not include abstract data or exhibitor/floor chatter in this segment."
                  : "Do not create presentation material from vague non-monitored audience chatter, snack tips, hallway energy, or unsourced social chatter. Use only source-attributed material from a monitored X voice, official schedule/session data, an article/media source, an operator statement, emergency content, or a sponsor message. If the input is only an unsourced audience tip, produce a review-only note that should not be used in the presentation rundown."
            })
          )
        : Promise.resolve(null)
      ])
    ).filter((segment): segment is Segment => Boolean(segment))
  );

  const customVoices = (await getXFollowVoicesFromDb()) ?? [];
  const blacklistedHandles = (await getBlacklistedXHandlesFromDb()) ?? [];
  const leaderboard = buildSocialVoiceLeaderboard(socialItems, customVoices, blacklistedHandles);
  const competitionDueNow = shouldRunSocialVoiceCompetition();
  await addCompetitionLeadersToXCallouts(leaderboard, blacklistedHandles);
  const competitionSegment = competitionDueNow
    ? [buildSocialVoiceCompetitionSegment(leaderboard)]
    : [];
  const latestSourceCards = buildLatestSourceCards(items, now);
  const segments = [...generatedSegments, ...competitionSegment, ...latestSourceCards];
  await saveGeneratedSegmentsToDb(segments);
  return segments;
}
