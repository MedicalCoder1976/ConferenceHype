import { createHash, randomUUID } from "node:crypto";
import { getPersona } from "@/lib/generation/personas";
import {
  buildBatchSegment,
  buildPubMedBackedJournalItem,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";
import { fetchPubMedArticlesForJournal, pubmedArticlesToIngestedItems } from "@/lib/sources/pubmed";
import { isAbstractSourceId } from "@/lib/sources/socialLinks";
import type { TopicSearchEntity } from "@/lib/sources/x";
import { markWeeklySourceSegment } from "@/lib/weeklySourceCards";
import type { IngestedItem, MedicalConference, OncologyJournal, Segment, SourceConfig } from "@/lib/types";

// Shared by scripts/generate-weekly-source-cards.ts (the Sunday sweep over
// the whole catalog) and the on-demand "generate more cards" admin action
// (one entity at a time) -- the per-entity generation logic lives here once
// so both call the exact same path instead of drifting apart, the way the
// smoke-test card tagging drifted earlier this session.

export type WeeklyCardEntity =
  | { type: "conference"; conference: MedicalConference }
  | { type: "journal"; journal: OncologyJournal }
  | { type: "source"; source: SourceConfig };

export function entitySourceId(entity: WeeklyCardEntity): string {
  if (entity.type === "conference") return entity.conference.id;
  if (entity.type === "journal") return `daily-journal-${entity.journal.id}`;
  return entity.source.id;
}

export function entityName(entity: WeeklyCardEntity): string {
  if (entity.type === "conference") return entity.conference.name;
  if (entity.type === "journal") return entity.journal.name;
  return entity.source.name;
}

function entityAcronym(entity: WeeklyCardEntity): string | undefined {
  if (entity.type === "conference") return entity.conference.acronym;
  if (entity.type === "journal") return entity.journal.abbreviation;
  return undefined;
}

function entitySourceUrl(entity: WeeklyCardEntity): string {
  if (entity.type === "conference") return entity.conference.officialUrl;
  if (entity.type === "journal") return entity.journal.officialUrl || entity.journal.rssUrl;
  return entity.source.url;
}

export function entitySelection(entity: WeeklyCardEntity) {
  if (entity.type === "conference") return { conferences: [entity.conference] };
  if (entity.type === "journal") return { journals: [entity.journal] };
  return { sourceIds: [entity.source.id] };
}

export function topicSearchEntityFor(entity: WeeklyCardEntity): TopicSearchEntity {
  return { sourceId: entitySourceId(entity), name: entityName(entity), acronym: entityAcronym(entity) };
}

// Must run before any X topic search, for every card-generation path (the
// weekly Sunday sweep and the on-demand "generate more cards" admin action
// alike) -- PubMed is the higher-priority, more authoritative source for
// journal content and has to be exhausted before falling back to a generic
// social search. Only applies to journal entities; conferences and
// newspapers have no PubMed equivalent and go straight to X as before.
export async function pubMedRescueJournalItems(entity: WeeklyCardEntity): Promise<IngestedItem[]> {
  if (entity.type !== "journal") {
    return [];
  }
  const articles = await fetchPubMedArticlesForJournal(entity.journal.name);
  if (articles.length === 0) {
    return [];
  }
  return pubmedArticlesToIngestedItems(articles, {
    sourceId: entity.journal.id,
    sourceName: entity.journal.name,
    sourceType: "official",
    rank: 1
  });
}

function stableKey(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function sourceUrlFlag(item: IngestedItem) {
  return `source_url:${stableKey(`${item.url}|${item.title}`.toLowerCase())}`;
}

export function existingWeeklyKeys(
  segments: Segment[],
  weekKey: string,
  weeklySourcePoolFlag: string
) {
  return new Set(
    segments
      .filter(
        (segment) =>
          segment.riskFlags.includes(weeklySourcePoolFlag) &&
          segment.riskFlags.includes(`weekly_key:${weekKey}`)
      )
      .flatMap((segment) => segment.riskFlags.filter((flag) => flag.startsWith("source_url:")))
  );
}

// existingKeys is read once at the start of a run, but generation (ingestion
// + PubMed enrichment) can take long enough for another run -- a daily
// repair pass, an admin's "generate more cards" click -- to save its own
// cards for the same source items in the meantime. Re-checking against the
// latest saved segments immediately before this run's own save narrows that
// window and has caught real duplicate cards in production.
export function dedupeAgainstFreshSegments(
  generated: Segment[],
  freshSegments: Segment[],
  weekKey: string,
  weeklySourcePoolFlag: string
): Segment[] {
  const freshKeys = existingWeeklyKeys(freshSegments, weekKey, weeklySourcePoolFlag);
  return generated.filter(
    (segment) => !segment.riskFlags.some((flag) => flag.startsWith("source_url:") && freshKeys.has(flag))
  );
}

function contextContentType(sourceType: IngestedItem["sourceType"]) {
  if (sourceType === "official") return "agenda_preview" as const;
  if (sourceType === "company") return "industry_floor" as const;
  if (sourceType.includes("social")) return "social_signal" as const;
  return "media_roundup" as const;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function naturalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// Spoken-language date range — "June 11 through 14, 2026" rather than the
// raw ISO strings a news reader would never actually say aloud.
function naturalConferenceDateRange(conference: MedicalConference) {
  if (conference.startDate && conference.endDate) {
    if (conference.startDate === conference.endDate) {
      return naturalDate(conference.startDate);
    }
    const [startYear, startMonth] = conference.startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = conference.endDate.split("-").map(Number);
    const startDay = Number(conference.startDate.split("-")[2]);
    if (startYear === endYear && startMonth === endMonth) {
      return `${MONTH_NAMES[startMonth - 1]} ${startDay} through ${endDay}, ${startYear}`;
    }
    return `${naturalDate(conference.startDate)} through ${naturalDate(conference.endDate)}`;
  }
  if (conference.startDate) {
    return naturalDate(conference.startDate);
  }
  if (conference.month && conference.year) {
    return `${MONTH_NAMES[conference.month - 1]} ${conference.year}`;
  }
  return "";
}

// Builds the actual Segment shell shared by every fallback announcement
// type below — only the spoken content differs per entity type.
function finalizeAnnouncementSegment({
  sourceId,
  sourceUrl,
  sourceType,
  weekKey,
  index,
  title,
  summary,
  script,
  citationLabel,
  journalId
}: {
  sourceId: string;
  sourceUrl: string;
  sourceType: IngestedItem["sourceType"];
  weekKey: string;
  index: number;
  title: string;
  summary: string;
  script: string;
  citationLabel: string;
  // Explicit, not derived from sourceId here -- only
  // buildJournalAnnouncementSegment ever passes one, and it passes the real
  // OncologyJournal.id directly (it already has the real object in scope),
  // never a string-shape guess. Conference/source callers pass undefined.
  journalId: string | undefined;
}): Segment {
  const persona = getPersona(personaIdForBatchIndex(index));
  const createdAt = new Date().toISOString();
  return markWeeklySourceSegment(
    {
      id: `weekly-context-${randomUUID()}`,
      title,
      summary,
      script,
      contentType: contextContentType(sourceType),
      personaId: persona.id,
      personaName: persona.name,
      hypeLevel: "standard",
      language: "English",
      status: "pending_review",
      citations: [{ label: citationLabel, url: sourceUrl, sourceType, journalId }],
      socialBuzzItems: [],
      riskFlags: [
        "weekly_source_context",
        `source_id:${sourceId}`,
        `source_url:${stableKey(`${sourceUrl}|${title}`.toLowerCase())}`
      ],
      confidenceScore: 70,
      createdAt,
      updatedAt: createdAt
    },
    weekKey
  );
}

// Real, fact-grounded, naturally-spoken content using only verified
// conference metadata (name, dates, location, specialty) — no fabricated
// claims about sessions or news that hasn't actually been published yet.
function buildConferenceAnnouncementSegment(
  conference: MedicalConference,
  weekKey: string,
  index: number
): Segment {
  const dateRange = naturalConferenceDateRange(conference);
  const location = [conference.city, conference.country].filter(Boolean).join(", ");
  const specialty = conference.specialties.length ? conference.specialties.join(" and ") : "medicine";
  const acronym = conference.acronym ? ` (${conference.acronym})` : "";
  const whenWhereSpoken = [dateRange ? `for ${dateRange}` : "", location ? `in ${location}` : ""]
    .filter(Boolean)
    .join(", ");
  const whenWherePlain = [dateRange, location].filter(Boolean).join(", ");

  const script = [
    `${conference.name}${acronym} is on the calendar${whenWhereSpoken ? ` ${whenWhereSpoken}` : ""}.`,
    `It is a meeting for the ${specialty} community, bringing clinicians and researchers together for sessions and presentations in the field.`,
    "No fresh official program updates or attributed coverage came through this week, so there is nothing new to summarize yet.",
    "ConferenceHype will keep tracking the official program, abstracts, and media coverage as they are published, and bring a source-attributed read as soon as there is something to report."
  ].join(" ");

  const summary = `${conference.name}${acronym} coverage preview${whenWherePlain ? `: ${whenWherePlain}` : ""}. No new official or attributed source material yet this week.`;

  return finalizeAnnouncementSegment({
    sourceId: conference.id,
    sourceUrl: conference.officialUrl,
    sourceType: "official",
    weekKey,
    index,
    title: `Weekly update: ${conference.name}`,
    summary,
    script,
    citationLabel: conference.name,
    journalId: undefined
  });
}

function buildJournalAnnouncementSegment(
  journal: OncologyJournal,
  weekKey: string,
  index: number
): Segment {
  const abbreviation = journal.abbreviation ? ` (${journal.abbreviation})` : "";
  const script = [
    `${journal.name}${abbreviation} is one of the journals ConferenceHype tracks for oncology and hematology coverage.`,
    "No new articles came through this journal's feed this week, so there is nothing fresh to summarize yet.",
    "ConferenceHype will pick up the next published issue as soon as it is available and bring a source-attributed read of what is in it."
  ].join(" ");
  const summary = `${journal.name}${abbreviation}: no new tracked articles this week.`;
  return finalizeAnnouncementSegment({
    sourceId: `daily-journal-${journal.id}`,
    sourceUrl: journal.officialUrl || journal.rssUrl,
    sourceType: "official",
    weekKey,
    index,
    title: `Weekly update: ${journal.name}`,
    summary,
    script,
    citationLabel: journal.name,
    // The real OncologyJournal object is already in scope here -- pass its
    // id directly rather than deriving one from a string, the strongest
    // possible guarantee.
    journalId: journal.id
  });
}

function buildSourceAnnouncementSegment(
  source: SourceConfig,
  weekKey: string,
  index: number
): Segment {
  const script = [
    `${source.name} is one of the clinical news and media sources ConferenceHype monitors.`,
    "No new attributed items came through this source this week, so there is nothing fresh to summarize yet.",
    `ConferenceHype will pick up new coverage from ${source.name} as soon as it is published.`
  ].join(" ");
  const summary = `${source.name}: no new attributed items this week.`;
  return finalizeAnnouncementSegment({
    sourceId: source.id,
    sourceUrl: source.url,
    sourceType: source.type,
    weekKey,
    index,
    title: `Weekly update: ${source.name}`,
    summary,
    script,
    citationLabel: source.name,
    journalId: undefined
  });
}

function buildAnnouncementSegment(entity: WeeklyCardEntity, weekKey: string, index: number): Segment {
  if (entity.type === "conference") return buildConferenceAnnouncementSegment(entity.conference, weekKey, index);
  if (entity.type === "journal") return buildJournalAnnouncementSegment(entity.journal, weekKey, index);
  return buildSourceAnnouncementSegment(entity.source, weekKey, index);
}

function sourceMatches(
  item: IngestedItem,
  selection: { conferences?: MedicalConference[]; journals?: OncologyJournal[]; sourceIds?: string[] }
) {
  return itemMatchesSelections({
    item,
    conferences: selection.conferences ?? [],
    journals: selection.journals ?? [],
    sourceIds: selection.sourceIds ?? []
  });
}

function pickItemsForSource(
  items: IngestedItem[],
  selection: { conferences?: MedicalConference[]; journals?: OncologyJournal[]; sourceIds?: string[] },
  limit: number
) {
  const seen = new Set<string>();
  return items
    .filter((item) => sourceMatches(item, selection))
    .filter((item) => {
      const key = `${item.url}|${item.title}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const rankDelta = a.rank - b.rank;
      if (rankDelta !== 0) return rankDelta;
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    })
    .slice(0, limit);
}

// Enforces the weekly sequence: official-page items, then abstract-library
// items, then — last — at most one social-voice item. Reserves a slot for
// the social card whenever one is available instead of letting it compete
// on rank with official/abstract items and lose out.
export function orderedPickForEntity(
  items: IngestedItem[],
  selection: { conferences?: MedicalConference[]; journals?: OncologyJournal[]; sourceIds?: string[] },
  cardsPerSource: number
) {
  const matched = pickItemsForSource(items, selection, cardsPerSource * 4);
  const social = matched.filter((item) => item.sourceType === "general_social");
  const nonSocial = matched.filter((item) => item.sourceType !== "general_social");
  const official = nonSocial.filter((item) => !isAbstractSourceId(item.sourceId));
  const abstracts = nonSocial.filter((item) => isAbstractSourceId(item.sourceId));
  const socialPick = social.slice(0, 1);
  const contentBudget = Math.max(cardsPerSource - socialPick.length, 0);
  return [...official, ...abstracts].slice(0, contentBudget).concat(socialPick);
}

async function buildSegmentsForItems({
  items,
  weekKey,
  existingKeys,
  startIndex,
  journalIds
}: {
  items: IngestedItem[];
  weekKey: string;
  existingKeys: Set<string>;
  startIndex: number;
  journalIds: ReadonlySet<string>;
}) {
  const segments: Segment[] = [];
  for (const item of items) {
    const urlFlag = sourceUrlFlag(item);
    if (existingKeys.has(urlFlag)) {
      continue;
    }
    const enriched = await buildPubMedBackedJournalItem(item, journalIds);
    if (!enriched) {
      continue;
    }
    const segment = markWeeklySourceSegment(
      buildBatchSegment(
        enriched,
        personaIdForBatchIndex(startIndex + segments.length),
        { batchLabel: `Weekly update ${weekKey}` },
        journalIds
      ),
      weekKey
    );
    segments.push({
      ...segment,
      riskFlags: Array.from(new Set([...segment.riskFlags, urlFlag]))
    });
    existingKeys.add(urlFlag);
  }
  return segments;
}

function addContextIfEmpty({
  generated,
  built,
  existingKeys,
  title,
  sourceUrl,
  buildFallback
}: {
  generated: Segment[];
  built: Segment[];
  existingKeys: Set<string>;
  title: string;
  sourceUrl: string;
  buildFallback: (index: number) => Segment;
}) {
  if (built.length > 0) {
    generated.push(...built);
    return;
  }
  const key = `source_url:${stableKey(`${sourceUrl}|${title}`.toLowerCase())}`;
  if (existingKeys.has(key)) {
    return;
  }
  const context = buildFallback(generated.length);
  generated.push(context);
  existingKeys.add(key);
}

// Real items if any were found this run; otherwise the best matching X post
// (own account, or whoever's discussing it); otherwise an honest, fact-only
// announcement that nothing new is available yet. Used for both the full
// weekly sweep and the one-entity "generate more cards" admin action.
export async function generateWeeklyCardsForEntities({
  entities,
  items,
  weekKey,
  existingKeys,
  cardsPerSourceFor,
  topicFallback
}: {
  entities: WeeklyCardEntity[];
  items: IngestedItem[];
  weekKey: string;
  existingKeys: Set<string>;
  cardsPerSourceFor: (entity: WeeklyCardEntity) => number;
  topicFallback: Map<string, IngestedItem>;
}): Promise<Segment[]> {
  const journalIds = new Set(
    entities.filter((entity): entity is Extract<WeeklyCardEntity, { type: "journal" }> => entity.type === "journal")
      .map((entity) => entity.journal.id)
  );
  const generated: Segment[] = [];
  for (const entity of entities) {
    const selected = orderedPickForEntity(items, entitySelection(entity), cardsPerSourceFor(entity));
    const socialFallback = selected.length === 0 ? topicFallback.get(entitySourceId(entity)) : undefined;
    const built = await buildSegmentsForItems({
      items: selected.length ? selected : socialFallback ? [socialFallback] : [],
      weekKey,
      existingKeys,
      startIndex: generated.length,
      journalIds
    });
    addContextIfEmpty({
      generated,
      built,
      existingKeys,
      title: `Weekly update: ${entityName(entity)}`,
      sourceUrl: entitySourceUrl(entity),
      buildFallback: (index) => buildAnnouncementSegment(entity, weekKey, index)
    });
  }
  return generated;
}
