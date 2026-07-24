import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeBroadcastCopy } from "@/lib/broadcast/sanitizeCopy";
import { formatVoiceSegment, SEGMENT_CLOSE } from "@/lib/broadcast/voiceSegment";
import { buildBroadcastSlots, buildJournalShowSlots } from "@/lib/rundown/slots";
import { buildBroadcastMetadata, extractExplicitStudyName, extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import { applySpokenPronunciations } from "@/lib/media/tts";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { buildConferenceCardDecks, buildJournalCardDecks, buildSourceCardDecks } from "@/lib/cardDeck";
import { buildRequiredSectionSummary } from "@/lib/segments/sectionSummary";
import {
  buildBatchSegment,
  buildConferenceContextItem,
  buildPubMedBackedJournalItem,
  isJournalItem,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import { filterBroadcastReadySegments } from "@/lib/data";
import { buildOperatorMusicSegment, OPERATOR_MUSIC_TRACKS } from "@/lib/broadcast/operatorMusic";
import { normalizeLegacyDailyCoverageDefaults } from "@/lib/dailyCoverage";
import {
  segmentSourceMatchesSelection,
  sortWeeklyReadySegmentsForSelection,
  weeklySourceWeekKey,
  WEEKLY_SOURCE_POOL_FLAG
} from "@/lib/weeklySourceCards";
import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";
import { conferenceLinkedSourceIds, monitoredXVoiceForEntity } from "@/lib/sources/socialLinks";
import { sourceRegistry } from "@/lib/sources/registry";
import { dedupeAgainstFreshSegments } from "@/lib/weeklySourceCardGeneration";
import type { IngestedItem, Segment } from "@/lib/types";

const source: IngestedItem = {
  id: "guard-source",
  title: "Conference program update",
  url: "https://example.com/program",
  excerpt:
    "The official program lists a late breaking session in the main auditorium tomorrow morning with a moderated discussion and a scheduled question period for registered conference attendees.",
  sourceName: "Official conference program",
  sourceType: "official",
  rank: 1
};

const framed = formatVoiceSegment({
  voiceName: "Echo Sage",
  topic: "late-breaking sessions",
  narrative:
    "The official program has published a schedule update. ConferenceHype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice.",
  at: new Date("2026-06-11T13:00:00Z")
});
assert.match(
  framed,
  /^Good (morning|evening), wherever you are\. This is Echo Sage from ConferenceHype\./
);
assert.ok(!framed.endsWith(SEGMENT_CLOSE));
const fourthFramed = formatVoiceSegment({
  voiceName: "Echo Sage",
  topic: "journal review",
  narrative: "From the June 2026 edition of Journal of Clinical Oncology, this journal review covers practice-changing results.",
  at: new Date("2026-06-11T13:00:00Z"),
  cardIndex: 3,
  publishedAt: "2026-06-15T00:00:00.000Z"
});
assert.match(
  fourthFramed,
  /This concludes ConferenceHype's coverage of the June 2026 issue of Journal of Clinical Oncology\./
);
assert.match(fourthFramed, /Which paper could change practice/);
assert.match(fourthFramed, /Tag us on X @conferencehype\./);
assert.match(fourthFramed, /Share this broadcast with a colleague or your clinical team/);
assert.match(fourthFramed, /subscribe with notifications turned on/);
assert.doesNotMatch(fourthFramed, /That is it for this segment/i);
assert.doesNotMatch(framed, /interactive AI commentary only/i);
assert.equal(applySpokenPronunciations("ASCO 2026 and Ib disease"), "Ask-ho 2026 and one B disease");
assert.equal(
  applySpokenPronunciations("Cholangiocarcinoma treatment"),
  "colangiocarcinoma treatment"
);
assert.equal(
  applySpokenPronunciations("ECOG PS 1, PR, CR, pCR, WHO, and NCI data"),
  "EE-kog PS 1, partial response, complete response, pathologic complete response, World Health Organization, and N-C-I data"
);
assert.equal(
  applySpokenPronunciations("Stage IA and Stage IIB were compared to Stage IIIA and Stage IVB."),
  "Stage 1 A and Stage 2 B were compared to Stage 3 A and Stage 4 B."
);

// Bug fixed 2026-07-18 (PMID 40729623): a Results section whose own prose
// naturally contains the word "discussion" (e.g. "...prognostic discussion
// tools (P < .05)") used to get misread as hitting a real "Discussion"
// section boundary, truncating Results early and fabricating a garbled
// fragment from whatever followed instead of the article's real Conclusion.
{
  const summary = buildRequiredSectionSummary({
    title: "Teaching Communication Skills",
    sourceName: "JCO Oncology Practice",
    text: [
      "PURPOSE: ASCO strongly endorses the integration of palliative care.",
      "METHODS: We designed and piloted a didactic simulation session.",
      "RESULTS: In year 1, 16 of 21 fellows completed surveys, with notable increase for prognostic discussion tools (P < .05). Comfort increased across multiple domains.",
      "CONCLUSION: Dedicated and iterative communication teaching in fellowship is imperative for future oncologists."
    ].join(" ")
  });
  assert.doesNotMatch(summary, /Discussion:\s*tools/i);
  assert.match(summary, /Discussion:\s*Dedicated and iterative communication teaching/);
}
// The ASCO-energy-all-day phrase must never reach air, no matter what filler
// word the LLM tacks onto the end of it -- "long", "seems to creep in", or
// any future variant. The strip must hit every speaker pipeline path: the
// spoken-audio path (applySpokenPronunciations) and the broadcast-copy path
// (sanitizeBroadcastCopy), not just whichever variant was first reported.
assert.doesNotMatch(
  applySpokenPronunciations("This is the desk. Conference Hype ASCO energy all day long. Back to you."),
  /ASCO\s+energy/i
);
assert.doesNotMatch(
  applySpokenPronunciations("This is the desk. ConferenceHype ASCO energy, all day. Back to you."),
  /ASCO\s+energy/i
);
assert.doesNotMatch(
  sanitizeBroadcastCopy("This is the desk. Conference Hype ASCO energy all day seems to creep in. Back to you."),
  /ASCO\s+energy/i
);

const copiedErrors = getUnsafeGeneratedSourceErrors({
  segment: {
    title: "Program update",
    summary: source.excerpt,
    script: source.excerpt
  },
  sources: [source]
});
assert.ok(copiedErrors.some((error) => error.includes("copies source wording")));

const sponsorBase: Segment = {
  id: "sponsor-guard",
  title: "Partner update",
  summary: "A commercial message from Example Health.",
  script: "Example Health is presenting its conference services.",
  contentType: "industry_floor",
  personaId: "echo-sage",
  personaName: "Echo Sage",
  hypeLevel: "standard",
  language: "English",
  status: "pending_review",
  citations: [],
  socialBuzzItems: [],
  riskFlags: ["sponsor_message", "paid_content"],
  confidenceScore: 100,
  createdAt: new Date().toISOString()
};

// An hour must use exactly 4 voices in equal-size sections, each introducing
// itself only once at the start of its section.
const hourCheckSegments: Segment[] = Array.from({ length: 80 }, (_, index) => ({
  ...sponsorBase,
  id: `hour-check-${index}`,
  title: `Hour check topic ${index}`,
  summary: `Plain summary text for hour check item ${index}.`,
  script: `Plain narrative body for hour check item ${index}.`,
  contentType: "media_roundup",
  status: "approved",
  riskFlags: []
}));
const hourCheckSlots = buildBroadcastSlots({
  segments: hourCheckSegments,
  scheduleSegments: [],
  baseTime: new Date("2026-06-22T13:00:00Z"),
  hours: 1
}).filter((slot) => slot.kind !== "music" && slot.segment);
const hourCheckVoices = new Set(hourCheckSlots.map((slot) => slot.segment?.personaName));
assert.equal(hourCheckVoices.size, 4);
const hourCheckCounts = new Map<string, number>();
for (const slot of hourCheckSlots) {
  const name = slot.segment?.personaName ?? "";
  hourCheckCounts.set(name, (hourCheckCounts.get(name) ?? 0) + 1);
}
assert.ok([...hourCheckCounts.values()].every((count) => count === hourCheckSlots.length / 4));
const hourCheckIntroCount = hourCheckSlots.filter((slot) =>
  /This is .+ from ConferenceHype/.test(slot.segment?.script ?? "")
).length;
assert.equal(hourCheckIntroCount, 4);
// A manually placed three-minute music card replaces one complete 135-second
// content + 45-second transition pair. The hour stays exactly 3,600 seconds,
// the following content remains on its original timestamp, and the music row
// remains DB-backed so it can be marked rendered after delivery.
const musicHourStart = new Date("2026-06-22T13:00:00Z");
const placedMusic = buildOperatorMusicSegment({
  track: OPERATOR_MUSIC_TRACKS[0],
  approvedAt: musicHourStart.toISOString()
});
const musicHourSlots = buildBroadcastSlots({
  segments: hourCheckSegments,
  scheduleSegments: [placedMusic],
  baseTime: musicHourStart,
  hours: 1
});
assert.equal(musicHourSlots.reduce((sum, slot) => sum + slot.durationSeconds, 0), 3600);
assert.equal(musicHourSlots[0].kind, "music");
assert.equal(musicHourSlots[0].durationSeconds, 180);
assert.equal(musicHourSlots[0].segment?.id, placedMusic.id);
assert.equal(musicHourSlots[1].at.toISOString(), "2026-06-22T13:03:00.000Z");

// A 30-minute single-journal show must group cards 4-at-a-time with a music
// break after every group, a disclaimer added after every 2nd group, one
// persona throughout, and zero cross-journal leakage even when other
// journals' segments are present in the input pool.
const journalShowJournalId = "55555555-5555-4555-8555-555555555555";
const journalShowOtherJournalId = "66666666-6666-4666-8666-666666666666";
const journalShowSegments: Segment[] = [
  ...Array.from({ length: 24 }, (_, index) => ({
    ...sponsorBase,
    id: `journal-show-${index}`,
    title: `Journal show topic ${index}`,
    summary: `Plain summary text for journal show item ${index}.`,
    script: `Plain narrative body for journal show item ${index}.`,
    contentType: "abstract_buzz" as const,
    status: "approved" as const,
    citations: [
      {
        label: `Test Journal: Journal show topic ${index}`,
        url: `https://example.com/journal-show-${index}`,
        sourceType: "official" as const,
        journalId: journalShowJournalId
      }
    ],
    riskFlags: []
  })),
  {
    ...sponsorBase,
    id: "journal-show-other-journal",
    title: "Other journal topic",
    summary: "Plain summary text for a different journal's item.",
    script: "Plain narrative body for a different journal's item.",
    contentType: "abstract_buzz" as const,
    status: "approved" as const,
    citations: [
      {
        label: "Other Journal: Other journal topic",
        url: "https://example.com/other-journal",
        sourceType: "official" as const,
        journalId: journalShowOtherJournalId
      }
    ],
    riskFlags: []
  }
];
const journalShowSlots = buildJournalShowSlots({
  segments: journalShowSegments,
  journalId: journalShowJournalId,
  baseTime: new Date("2026-07-13T16:00:00Z")
});
// 6 groups of (4 content + 1 music) = 30, plus a disclaimer after every 2nd
// group (groups 2, 4, 6) = 3 more, plus the one true-end outro = 34 slots.
assert.equal(journalShowSlots.length, 34);
for (let group = 0; group < 6; group += 1) {
  const groupStart = group * 5 + Math.floor(group / 2);
  for (let card = 0; card < 4; card += 1) {
    assert.equal(journalShowSlots[groupStart + card].kind !== "music", true);
  }
  assert.equal(journalShowSlots[groupStart + 4].kind, "music");
}
const journalShowDisclaimerSlots = journalShowSlots.filter((slot) =>
  slot.segment?.riskFlags.includes("journal_show_disclaimer")
);
assert.equal(journalShowDisclaimerSlots.length, 3);
assert.equal(
  journalShowSlots.filter((slot) => slot.segment?.riskFlags.includes("journal_show_outro")).length,
  1,
  "A full journal show must also have exactly one true-end outro."
);
assert.equal(journalShowSlots.at(-1)?.segment?.riskFlags.includes("journal_show_outro"), true);
const journalShowPersonaNames = new Set(
  journalShowSlots.filter((slot) => slot.segment).map((slot) => slot.segment?.personaName)
);
assert.equal(journalShowPersonaNames.size, 1);
const journalShowContentJournalIds = new Set(
  journalShowSlots
    .filter((slot) =>
      slot.kind !== "music" &&
      !slot.segment?.riskFlags.includes("journal_show_disclaimer") &&
      !slot.segment?.riskFlags.includes("journal_show_outro")
    )
    .map((slot) => slot.segment?.citations?.[0]?.journalId)
);
assert.deepEqual([...journalShowContentJournalIds], [journalShowJournalId]);

const shortJournalShowSlots = buildJournalShowSlots({
  segments: journalShowSegments.slice(0, 3).map((segment) => ({
    ...segment,
    script: segment.script.replace(
      "Plain narrative body",
      "From the July 2026 edition of Test Journal, this journal review covers"
    ),
    citations: segment.citations.map((citation) => ({
      ...citation,
      publishedAt: "2026-07-10T00:00:00.000Z"
    }))
  })),
  journalId: journalShowJournalId,
  baseTime: new Date("2026-07-13T16:00:00Z")
});
const shortJournalOutro = shortJournalShowSlots.find((slot) =>
  slot.segment?.riskFlags.includes("journal_show_outro")
)?.segment?.script ?? "";
assert.match(
  shortJournalOutro,
  /That's it for now for ConferenceHype's coverage of the July 2026 issue of Test Journal\./
);
assert.match(shortJournalOutro, /If anything was missed/);
assert.match(shortJournalOutro, /Tag us on X @conferencehype\./);
assert.match(shortJournalOutro, /share this review with your clinical team/);
assert.match(shortJournalOutro, /subscribe with notifications turned on/);
assert.doesNotMatch(shortJournalOutro, /That (?:is it|wraps up) for this segment/i);
const shortJournalContentScripts = shortJournalShowSlots
  .filter((slot) => slot.segment && !slot.segment.riskFlags.includes("journal_show_outro"))
  .map((slot) => slot.segment?.script ?? "");
assert.ok(
  shortJournalContentScripts.every((script) => !script.includes("That's it for now")),
  "Journal content cards must not repeat the final coverage conclusion."
);
assert.equal(
  shortJournalShowSlots
    .map((slot) => slot.segment?.script ?? "")
    .join(" ")
    .match(/That's it for now/g)?.length,
  1,
  "A short journal show must contain exactly one final coverage conclusion."
);

// buildBroadcastMetadata's titleDateOverride must be strictly additive:
// omitted, it must produce byte-identical output to today's air-date
// behavior; set, it must use the override's month/year instead.
const journalShowTestJournal = {
  id: journalShowJournalId,
  name: "Test Journal",
  abbreviation: "Test J",
  rssUrl: "https://example.com/test-journal.rss",
  officialUrl: "https://example.com/test-journal",
  enabled: true,
  specialty: "Internal Medicine"
};
const journalShowJournalsById = new Map([[journalShowJournalId, journalShowTestJournal]]);
const metadataHourStart = new Date("2026-07-13T16:00:00Z");
const metadataWithoutOverride = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: journalShowJournalsById
});
const metadataWithOverrideOmittedAgain = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: journalShowJournalsById
});
assert.deepEqual(metadataWithoutOverride, metadataWithOverrideOmittedAgain);
assert.match(metadataWithoutOverride.title, /Jul 13, 2026/);
const metadataWithOverride = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-03-15"
});
assert.match(metadataWithOverride.title, /Mar 2026/);
assert.doesNotMatch(metadataWithOverride.title, /Jul 13, 2026/);
assert.match(
  metadataWithOverride.description,
  /Journals and publication dates covered: Test Journal \(publication date unavailable\)\./
);
const legacyNeurologyMetadata = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: new Map([[journalShowJournalId, { ...journalShowTestJournal, name: "Neurology", specialty: "Others" }]])
});
assert.match(legacyNeurologyMetadata.title, /Neurology - Neurology/);
assert.doesNotMatch(`${legacyNeurologyMetadata.title} ${legacyNeurologyMetadata.description} ${legacyNeurologyMetadata.tags.join(" ")}`, /\bOthers\b/);

assert.equal(extractExplicitStudyName("V-NE Ulcer Study 6: randomized findings"), "V-NE Ulcer Study 6");
assert.equal(extractExplicitStudyName("Results from NCT01234567 in adults"), "NCT01234567");
assert.equal(extractExplicitStudyName("A randomized controlled trial in adults"), undefined);
assert.deepEqual(
  extractExplicitStudyNames("The ILUSTRO study was followed by the POLAR trial and RESOLUTION Trial."),
  ["ILUSTRO study", "POLAR trial", "RESOLUTION Trial"]
);
assert.equal(extractExplicitStudyName("AI triage in the LungIMPACT randomized controlled trial"), "LungIMPACT trial");
assert.equal(extractExplicitStudyName("The LungIMPACT trial evaluated AI triage"), "LungIMPACT trial");
const firstStudySlotIndex = journalShowSlots.findIndex((slot) => slot.segment && !slot.segment.riskFlags.includes("journal_show_outro"));
const studyNamedSlots = journalShowSlots.map((slot, index) => index === firstStudySlotIndex && slot.segment
  ? { ...slot, segment: { ...slot.segment, title: "V-NE Ulcer Study 6: randomized findings" } }
  : slot);
const optimizedStudyMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: studyNamedSlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01"
});
assert.match(optimizedStudyMetadata.title, /^V-NE Ulcer Study 6:/);
assert.match(optimizedStudyMetadata.description, /^Studies covered: V-NE Ulcer Study 6\./);
assert.equal(optimizedStudyMetadata.tags[0], "V-NE Ulcer Study 6");
assert.equal(optimizedStudyMetadata.thumbnailHeadline, "V-NE Ulcer Study 6: What Did It Find?");
assert.deepEqual(optimizedStudyMetadata.studyNames, ["V-NE Ulcer Study 6"]);
const firstStudySegmentId = studyNamedSlots[firstStudySlotIndex].segment!.id;
const abstractNamedMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: journalShowSlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01",
  studySourceTextBySegmentId: new Map([[firstStudySegmentId, "Methods from the PREDICT study were prespecified."]])
});
assert.match(abstractNamedMetadata.title, /^PREDICT study:/);
assert.equal(abstractNamedMetadata.tags[0], "PREDICT study");
assert.equal(metadataWithoutOverride.thumbnailHeadline, undefined);
assert.deepEqual(metadataWithoutOverride.studyNames, []);

assert.ok(
  validateSegmentForApproval(sponsorBase).some((error) =>
    error.includes("explicitly labeled")
  )
);
assert.equal(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "Sponsored: Example Health partner update",
    script: "This is a sponsored message from Example Health."
  }).length,
  0
);

const youtubeFrameSource = readFileSync(
  path.join(process.cwd(), "components", "YoutubeFrame.tsx"),
  "utf8"
);
assert.match(youtubeFrameSource, /origin:\s*siteOrigin/);
assert.match(youtubeFrameSource, /widget_referrer:\s*siteOrigin/);
assert.match(
  youtubeFrameSource,
  /referrerPolicy="strict-origin-when-cross-origin"/
);

const natureCancerSeed = oncologyJournalSeeds.find((journal) => journal.name === "Nature Cancer");
assert.equal(natureCancerSeed?.rssUrl, "https://feeds.nature.com/natcancer/rss/current");

const selectedJournal = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "The Lancet Oncology",
  abbreviation: "Lancet Oncol",
  rssUrl: "https://example.com/lancet-oncology.rss",
  officialUrl: "https://example.com/lancet-oncology",
  enabled: true
};
const selectedClinicalSource = {
  id: "medpage-today",
  name: "MedPage Today",
  url: "https://www.medpagetoday.com/rss",
  type: "media" as const,
  rank: 1,
  enabled: true
};
const selectedConference = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Selected Oncology Meeting",
  acronym: "SOM",
  specialties: ["Oncology"],
  startDate: "2026-06-19",
  endDate: "2026-06-20",
  month: 6,
  year: 2026,
  timezone: "America/New_York",
  officialUrl: "https://example.com/meeting",
  enabled: true,
  operatorAdded: false
};
// Conference/journal/source -> monitored X voice linking must be data-driven
// (acronym/abbreviation/id keyed), not hardcoded to one conference, so every
// conference, journal, or newspaper with a matching registry/seed entry
// auto-links — and unrelated entities must not get a false-positive match.
assert.equal(monitoredXVoiceForEntity({ acronym: "EHA" })?.handle, "@EHA_Hematology");
assert.equal(monitoredXVoiceForEntity({ id: "nejm" })?.handle, "@NEJM");
assert.equal(monitoredXVoiceForEntity({ id: "onclive" })?.handle, "@OncLive");
assert.equal(monitoredXVoiceForEntity({ id: "stat-news" })?.handle, "@statnews");
assert.equal(monitoredXVoiceForEntity({ abbreviation: "Lancet Oncology" })?.handle, "@TheLancetOncol");
assert.equal(monitoredXVoiceForEntity({ id: "medpage-today" }), null);
assert.equal(monitoredXVoiceForEntity(selectedConference), null);

const ehaConference = {
  ...selectedConference,
  id: "44444444-4444-4444-8444-444444444444",
  name: "European Hematology Association Congress",
  acronym: "EHA"
};
assert.deepEqual(
  conferenceLinkedSourceIds(ehaConference, sourceRegistry).map((source) => source.id),
  ["eha-2026-abstract-library", "eha-2026-program", "eha-2026-onsite", "eha-2026-exhibition", "eha-2026-media"]
);
assert.deepEqual(conferenceLinkedSourceIds(selectedConference, sourceRegistry), []);

const unselectedJcoItem: IngestedItem = {
  id: "jco-leak",
  sourceId: "daily-journal-22222222-2222-4222-8222-222222222222",
  title: "Journal of Clinical Oncology article",
  url: "https://example.com/jco",
  excerpt: "Journal of Clinical Oncology abstract text.",
  sourceName: "Journal of Clinical Oncology",
  sourceType: "official",
  rank: 1
};
assert.equal(
  itemMatchesSelections({
    item: unselectedJcoItem,
    conferences: [],
    journals: [selectedJournal],
    sourceIds: []
  }),
  false
);
assert.equal(
  itemMatchesSelections({
    item: { ...unselectedJcoItem, sourceId: `daily-journal-${selectedJournal.id}` },
    conferences: [],
    journals: [selectedJournal],
    sourceIds: []
  }),
  true
);
const normalizedSyntheticPlan = normalizeLegacyDailyCoverageDefaults({
  plan: {
    coverageDate: "2026-06-19",
    conferenceIds: [],
    journalIds: [],
    sourceIds: [`daily-journal-${selectedJournal.id}`],
    customItems: [],
    priorityTopics: [],
    exclusions: [],
    breakingNewsEnabled: true,
    notes: ""
  },
  journals: [selectedJournal],
  sources: []
});
assert.deepEqual(normalizedSyntheticPlan.journalIds, []);
assert.deepEqual(normalizedSyntheticPlan.sourceIds, []);
const normalizedDefaultSourcePlan = normalizeLegacyDailyCoverageDefaults({
  plan: {
    ...normalizedSyntheticPlan,
    journalIds: [],
    sourceIds: [selectedClinicalSource.id]
  },
  journals: [selectedJournal],
  sources: [selectedClinicalSource]
});
assert.deepEqual(normalizedDefaultSourcePlan.sourceIds, []);
const normalizedDefaultConferencePlan = normalizeLegacyDailyCoverageDefaults({
  plan: {
    ...normalizedSyntheticPlan,
    conferenceIds: [selectedConference.id],
    journalIds: [],
    sourceIds: []
  },
  journals: [selectedJournal],
  conferences: [selectedConference],
  sources: [selectedClinicalSource]
});
assert.deepEqual(normalizedDefaultConferencePlan.conferenceIds, []);
const explicitSavedPlan = normalizeLegacyDailyCoverageDefaults({
  plan: {
    ...normalizedSyntheticPlan,
    journalIds: [selectedJournal.id]
  },
  journals: [selectedJournal],
  sources: [selectedClinicalSource],
  clearLegacyDefaults: false
});
assert.deepEqual(explicitSavedPlan.journalIds, [selectedJournal.id]);
assert.equal(
  isGenericConferenceLandingItem({
    id: "asco-homepage",
    sourceId: "daily-conference-33333333-3333-4333-8333-333333333333",
    title: "ASCO Meetings",
    url: "https://meetings.asco.org",
    excerpt: "ASCO Meetings Program Guide",
    sourceName: "American Society of Clinical Oncology Annual Meeting",
    sourceType: "official",
    rank: 1
  }),
  true
);
assert.equal(
  itemMatchesSelections({
    item: {
      id: "selected-meeting-abstract",
      sourceId: selectedConference.id,
      title: "Phase 2 study reports response data in oncology",
      url: "https://example.com/meeting/abstract",
      excerpt: "Background, Methods, Results, and Discussion are available for this selected meeting abstract.",
      sourceName: selectedConference.name,
      sourceType: "official",
      rank: 1
    },
    conferences: [selectedConference],
    journals: [],
    sourceIds: []
  }),
  true
);

// Conference-linked X voice posts (e.g. @EHA_Hematology tagged for the EHA
// conference) must match the conference selection, skip journal/PubMed
// enrichment, and pass validation as social signals rather than being held
// to the science-card Background/Methods/Results/Discussion requirement.
const conferenceLinkedXPost: IngestedItem = {
  id: "x-eha-congress-post",
  sourceId: `daily-conference-${selectedConference.id}-x-eha_hematology`,
  title: "Monitored X voice: European Hematology Association",
  url: "https://x.com/EHA_Hematology/status/123",
  excerpt: "Late-breaking abstract session on CAR-T therapy in relapsed lymphoma is starting now at #EHA2026.",
  sourceName: "X voice monitor",
  sourceType: "general_social",
  rank: 5,
  author: "@EHA_Hematology"
};
assert.equal(
  itemMatchesSelections({
    item: conferenceLinkedXPost,
    conferences: [selectedConference],
    journals: [],
    sourceIds: []
  }),
  true
);
assert.equal(
  itemMatchesSelections({
    item: {
      id: "selected-eha-program",
      sourceId: `daily-conference-${selectedConference.id}-eha-2026-program`,
      title: "Selected meeting program update",
      url: "https://example.com/meeting/program",
      excerpt:
        "The selected meeting program lists a scheduled session with study discussion and registered attendee details.",
      sourceName: selectedConference.name,
      sourceType: "official",
      rank: 1
    },
    conferences: [selectedConference],
    journals: [],
    sourceIds: []
  }),
  true
);
assert.equal(isGenericConferenceLandingItem(buildConferenceContextItem(selectedConference)), false);
const weeklyReadyCard: Segment = {
  ...sponsorBase,
  id: "weekly-ready-card",
  title: "Weekly update: selected meeting program",
  summary: "A selected meeting program update.",
  script: "A selected meeting program update from the official source.",
  contentType: "agenda_preview",
  status: "pending_review",
  citations: [{ label: "Selected meeting", url: "https://example.com/meeting/program", sourceType: "official" }],
  riskFlags: [
    WEEKLY_SOURCE_POOL_FLAG,
    "weekly_key:2026-W25",
    `source_id:daily-conference-${selectedConference.id}-eha-2026-program`
  ],
  createdAt: "2026-06-15T00:00:00.000Z"
};
assert.deepEqual(
  sortWeeklyReadySegmentsForSelection(
    [
      { ...weeklyReadyCard, id: "already-rendered-weekly-card", status: "rendered" },
      weeklyReadyCard
    ],
    { conferences: [selectedConference], journals: [], sourceIds: [] }
  ).map((segment) => segment.id),
  ["weekly-ready-card"]
);
// A leftover, never-presented announcement card from a past week must not
// outrank this week's real card just because it has an earlier createdAt --
// that exact bug let a stale "no new tracked articles" card from last week
// permanently win the one-hour batch's reuse-from-pool slot over fresh,
// real, source-backed content generated minutes ago.
const currentWeekKey = weeklySourceWeekKey();
const staleAnnouncementCard: Segment = {
  ...weeklyReadyCard,
  id: "stale-announcement-card",
  riskFlags: [
    WEEKLY_SOURCE_POOL_FLAG,
    "weekly_source_context",
    "weekly_key:2020-W01",
    `source_id:daily-conference-${selectedConference.id}-eha-2026-program`
  ],
  createdAt: "2020-01-01T00:00:00.000Z"
};
const freshRealCard: Segment = {
  ...weeklyReadyCard,
  id: "fresh-real-card",
  riskFlags: [
    WEEKLY_SOURCE_POOL_FLAG,
    `weekly_key:${currentWeekKey}`,
    `source_id:daily-conference-${selectedConference.id}-eha-2026-program`
  ],
  createdAt: new Date().toISOString()
};
assert.deepEqual(
  sortWeeklyReadySegmentsForSelection(
    [staleAnnouncementCard, freshRealCard],
    { conferences: [selectedConference], journals: [], sourceIds: [] }
  ).map((segment) => segment.id),
  ["fresh-real-card", "stale-announcement-card"]
);
assert.equal(
  segmentSourceMatchesSelection(weeklyReadyCard, {
    conferences: [selectedConference],
    journals: [],
    sourceIds: []
  }),
  true
);
assert.equal(
  segmentSourceMatchesSelection(
    {
      riskFlags: [
        WEEKLY_SOURCE_POOL_FLAG,
        "weekly_key:2026-W25",
        "source_id:daily-conference-99999999-9999-4999-8999-999999999999"
      ]
    },
    { conferences: [selectedConference], journals: [], sourceIds: [] }
  ),
  false
);
assert.equal(
  segmentSourceMatchesSelection(
    { riskFlags: ["platform_smoke_scheduled_card"] },
    { conferences: [selectedConference], journals: [], sourceIds: [] }
  ),
  false
);

// dedupeAgainstFreshSegments: a card must be dropped if another process
// already saved the same source item (same source_url: flag) for this week
// in the gap between reading existingKeys and this run's own save -- the
// race this guards against.
const candidateNewCard: Segment = {
  ...weeklyReadyCard,
  id: "candidate-new-card",
  riskFlags: [
    WEEKLY_SOURCE_POOL_FLAG,
    "weekly_key:2026-W26",
    "source_url:abc123def4567890"
  ]
};
assert.deepEqual(
  dedupeAgainstFreshSegments(
    [candidateNewCard],
    [{ ...weeklyReadyCard, riskFlags: [WEEKLY_SOURCE_POOL_FLAG, "weekly_key:2026-W26", "source_url:abc123def4567890"] }],
    "2026-W26",
    WEEKLY_SOURCE_POOL_FLAG
  ),
  []
);
assert.deepEqual(
  dedupeAgainstFreshSegments([candidateNewCard], [], "2026-W26", WEEKLY_SOURCE_POOL_FLAG),
  [candidateNewCard]
);

assert.ok(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "Bad stored intake card",
    summary:
      [
        "The",
        "stored intake text",
        "does not expose the full methods section for this item. Results, The",
        "stored intake text",
        "does not expose the results section for this item."
      ].join(" "),
    script:
      ["Discussion, The discussion", "should remain limited", "to the source-described topic until the full article text is available."].join(" "),
    riskFlags: []
  }).some((error) => error.includes("missing-intake failure language"))
);

assert.equal(
  filterBroadcastReadySegments([
    {
      ...sponsorBase,
      title: "Legacy leaked JCO card",
      summary: "From the June edition of Journal of Clinical Oncology.",
      script: "Background: selected-source marker is missing.",
      contentType: "abstract_buzz",
      citations: [{ label: "Journal of Clinical Oncology", url: "https://example.com/jco", sourceType: "official" }],
      riskFlags: ["previous_day_batch_intake", "genuine_source_rewrite"]
    },
    {
      ...sponsorBase,
      title: "Selected JCO card",
      summary: "From the June edition of Journal of Clinical Oncology.",
      script: "Background: source ID marker is present.",
      contentType: "abstract_buzz",
      citations: [{ label: "Journal of Clinical Oncology", url: "https://example.com/jco", sourceType: "official" }],
      riskFlags: [
        "previous_day_batch_intake",
        "genuine_source_rewrite",
        `source_id:daily-journal-${selectedJournal.id}`
      ]
    }
  ]).length,
  1
);

assert.ok(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "EHA2026 abstract LB5001: title-only abstract listing",
    summary:
      "EHA, EHA2026 official abstract library intake. Background, Official EHA2026 abstract listing LB5001. Methods, Presenter. Results, EHA Library reference. Discussion, Only the public listing metadata is available here; do not infer methods, results, or clinical significance beyond the title.",
    script:
      "Background: Official EHA2026 abstract listing LB5001. Methods: Presenter. Results: EHA Library reference. Discussion: Only the public listing metadata is available here; do not infer methods, results, or clinical significance beyond the title.",
    contentType: "abstract_buzz",
    riskFlags: ["source_id:eha-2026-abstract-library"]
  }).some((error) => error.includes("only listing metadata"))
);

assert.ok(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "One-hour batch 23:00 UTC: EHA2026 Congress - The European Hematology Association (EHA)",
    summary:
      "European Hematology Association Congress intake. Background, Topics-in-Focus program Precision Hematology Topics-in-Focus program Hemoglobinopathies Topics-in-Focus program Thank you for joining us in Stockholm and virtually during EHA2026 Congress. Methods, Registration is still open until June 30. Results, Congress platform will remain open until October.",
    script:
      "Background: Topics-in-Focus program Precision Hematology. Methods: Registration is still open until June 30. Results: Congress platform will remain open until October 15, 2026. Discussion: Register virtually until June 30 and enjoy scientific content available on-demand until October.",
    contentType: "agenda_preview",
    riskFlags: ["source_id:eha-2026-program"]
  }).some((error) => error.includes("must not enter the broadcast queue"))
);

assert.ok(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "One-hour batch 23:00 UTC: EHA2026 program - The European Hematology Association (EHA)",
    summary:
      "EHA, EHA2026 official program intake. Background, Clinical practice Our guidelines initiative Learning paths European Hematology Curriculum Monitoring and career development Career comparison tool Specialized Working Groups Support for SWG scientific meetings Topics-in-Focus program Precision Hematology Topics-in-Focus program Hemoglobinopathies Topics-in-Focus program EHA2026 program EHA2026 EBAH CME credits Information.",
    script:
      "Background: Clinical practice Our guidelines initiative Learning paths European Hematology Curriculum Monitoring and career development Career comparison tool Specialized Working Groups Support for SWG scientific meetings Topics-in-Focus program Precision Hematology Topics-in-Focus program Hemoglobinopathies Topics-in-Focus program EHA2026 program EHA2026 EBAH CME credits Information.",
    contentType: "agenda_preview",
    riskFlags: ["source_id:eha-2026-program"]
  }).some((error) => error.includes("must not enter the broadcast queue"))
);

const dailyCoveragePlannerSource = readFileSync(
  path.join(process.cwd(), "components", "DailyCoveragePlanner.tsx"),
  "utf8"
);
const broadcastRundownSource = readFileSync(
  path.join(process.cwd(), "components", "BroadcastRundown.tsx"),
  "utf8"
);
assert.match(dailyCoveragePlannerSource, /conferencehype:daily-coverage-selection/);
assert.match(broadcastRundownSource, /conferencehype:daily-coverage-selection/);
assert.match(broadcastRundownSource, /filterSegmentsForSourceSelection/);


const renderHourSource = readFileSync(
  path.join(process.cwd(), "scripts", "render-hour-broadcast.ts"),
  "utf8"
);
assert.match(renderHourSource, /function enforceOneHourFrame/);
assert.match(renderHourSource, /Removed \$\{removedContentCards\} trailing content card/);
assert.match(renderHourSource, /while \(remainingSeconds > 0\)/);
assert.match(renderHourSource, /Math\.min\(OPERATOR_MUSIC_SECONDS, remainingSeconds\)/);
assert.match(renderHourSource, /durationSeconds = Math\.min\(Number\(process\.env\.HOUR_BROADCAST_SECONDS \?\? 3600\), 3600\)/);

// Bug fixed 2026-07-12: the per-card audio amix must run for the length of
// the LONGEST (latest-ending) stream, not the FIRST one. allStreams lists
// the per-gap music-bed entries first, and each bed entry is now a short,
// finite clip trimmed to just its own slot (since the earlier bed-bleeding
// fix) -- with duration=first, the whole mixed audio output ended the
// instant that first, early, short bed clip finished, silencing every
// card scheduled after it even though the video kept rendering for the
// full hour. Confirmed on a real broadcast where only the opening stretch
// of content was audible.
assert.match(renderHourSource, /amix=inputs=\$\{totalStreams\}:duration=longest:normalize=0/);
assert.doesNotMatch(renderHourSource, /amix=inputs=\$\{totalStreams\}:duration=first/);
assert.match(renderHourSource, /placedMusicPath/);
assert.match(renderHourSource, /!card\.riskFlags\?\.includes\("operator_music_card"\)/);
assert.match(renderHourSource, /\.filter\(\(card\) => card\.segmentId\)/);

// Migrated 2026-07-16 from live RTMP streaming to render-then-upload: the
// video no longer exists before rendering finishes (create-youtube-broadcast.ts
// used to bind an empty live-broadcast shell first), so render-hour-broadcast.ts
// now uploads the finished file directly, using the real, final `cards` list
// as the single source of truth for title/description/tags -- there's no
// separate earlier snapshot left to drift from.
assert.match(renderHourSource, /Uploaded \$\{youtubeUrl\}, public immediately/);
assert.match(renderHourSource, /useFullLengthMusicPadding/);
assert.match(renderHourSource, /OPERATOR_MUSIC_TRACKS\[musicIndex % OPERATOR_MUSIC_TRACKS\.length\]/);
assert.match(renderHourSource, /buildBroadcastMetadata\(\{/);
assert.match(renderHourSource, /headline:\s*actualMetadata\.thumbnailHeadline/);
const thumbnailRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "youtube-thumbnail", "route.tsx"), "utf8");
assert.match(thumbnailRouteSource, /params\.get\("headline"\)/);
assert.match(thumbnailRouteSource, /STUDY RESULTS/);
const stationMetadataSource = readFileSync(path.join(process.cwd(), "scripts", "refresh-station-video-metadata.ts"), "utf8");
assert.match(stationMetadataSource, /updateYoutubeVideoMetadata/);
assert.match(stationMetadataSource, /uploadYoutubeThumbnail/);
assert.doesNotMatch(stationMetadataSource, /uploadVideoToYoutube/);
const weekdayWheelSource = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
assert.match(weekdayWheelSource, /npm run job:station-metadata/);
assert.match(weekdayWheelSource, /STATION_METADATA_DATE:/);
const uploadBroadcastVideoSource = readFileSync(
  path.join(process.cwd(), "lib", "youtube", "uploadBroadcastVideo.ts"),
  "utf8"
);
assert.match(uploadBroadcastVideoSource, /uploadType=resumable&part=snippet,status/);
// Changed 2026-07-17: uploads go public immediately, not private+publishAt
// scheduled -- guard against a future edit silently reintroducing the
// private/scheduled behavior (and its wall-clock-derivation complexity)
// without it being a deliberate decision.
assert.match(uploadBroadcastVideoSource, /privacyStatus:\s*"public"/);
assert.doesNotMatch(uploadBroadcastVideoSource, /publishAt/);
const streamWorkflowSource = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "youtube-stream.yml"),
  "utf8"
);
const renderStepSource = streamWorkflowSource.slice(
  streamWorkflowSource.indexOf("Render and upload presentation"),
  streamWorkflowSource.indexOf("Verify public stream and writeout alignment")
);
assert.match(renderStepSource, /YOUTUBE_OAUTH_CLIENT_ID: \$\{\{ secrets\.YOUTUBE_OAUTH_CLIENT_ID \}\}/);
assert.match(renderStepSource, /YOUTUBE_OAUTH_CLIENT_SECRET: \$\{\{ secrets\.YOUTUBE_OAUTH_CLIENT_SECRET \}\}/);
assert.match(renderStepSource, /YOUTUBE_OAUTH_REFRESH_TOKEN: \$\{\{ secrets\.YOUTUBE_OAUTH_REFRESH_TOKEN \}\}/);

// A narrative review with no Methods/Results structure in its abstract must
// not be forced into the Background/Methods/Results/Discussion template --
// it should just be called a good review on the topic, and the validator
// must not hold it to the structured-section requirement.
const narrativeReviewItem: IngestedItem = {
  id: "lancet-haem-review",
  sourceId: `daily-journal-${selectedJournal.id}`,
  title: "Donor cell-derived haematological neoplasms after allogeneic haematopoietic cell transplantation",
  url: "https://pubmed.ncbi.nlm.nih.gov/00000000/",
  excerpt:
    "Donor cell-derived haematological neoplasms (DDHN) are rare disorders and currently do not have standardised diagnostic criteria and therapeutic management. International experts in allogeneic transplantation and haematological malignancies from Europe, the Americas, and Australia worked together on behalf of the EBMT Practice Harmonisation and Guidelines Committee to delineate a pragmatic diagnostic framework and issue guidance for downstream clinical management for DDHN. In this Review, we present the epidemiology and clinical definitions of DDHN, provide guidance on diagnosis and prevention, and outline recommendations for donor management.",
  sourceName: "The Lancet Haematology",
  sourceType: "official",
  rank: 1,
  publishedAt: "2026-06-01T00:00:00.000Z"
};
const narrativeReviewSegment = buildBatchSegment(
  narrativeReviewItem,
  personaIdForBatchIndex(0),
  { index: 0 },
  new Set([selectedJournal.id])
);
assert.doesNotMatch(narrativeReviewSegment.script, /\bMethods:|\bResults:|\bDiscussion:/);
assert.match(narrativeReviewSegment.script, /good review on the topic/i);
assert.ok(narrativeReviewSegment.riskFlags.includes("narrative_review_card"));
assert.deepEqual(validateSegmentForApproval(narrativeReviewSegment), []);

// Bug fixed 2026-07-12: isJournalItem() only recognized the
// "daily-journal-" prefixed sourceId form or a narrow sourceName keyword
// regex (journal/jama/lancet/nejm/nature/annals/leukemia/bmj/blood cancer).
// pubMedRescueJournalItems() (the NCBI [Journal]-search fallback) sets a
// bare, unprefixed journal id as sourceId, and most of the 90 real journals
// added in the specialty-tab expansion (e.g. "Kidney Medicine") don't match
// the keyword regex either -- so those items were silently misclassified as
// non-journal, skipped the narrative-review exemption entirely, and got
// forced through the strict four-section template. When the source was
// short (an erratum notice, a case report, a commentary), that template's
// own honest "needs PubMed or full-record confirmation" fallback strings --
// which are indistinguishable at the regex level from genuine intake-failure
// language -- made the card permanently unable to pass approval. Confirmed
// against real stuck pending_review rows in production.
const bareIdJournalItem: IngestedItem = {
  id: "kidney-med-erratum",
  sourceId: selectedJournal.id,
  title: "Erratum to Impact of Prior Kidney Transplantation on Symptom Burden",
  url: "https://pubmed.ncbi.nlm.nih.gov/00000001/",
  excerpt: "[This corrects the article DOI: 10.1016/j.xkme.2026.101357.].",
  sourceName: "Kidney Medicine",
  sourceType: "official",
  rank: 1,
  publishedAt: "2026-06-01T00:00:00.000Z"
};
assert.equal(isJournalItem(bareIdJournalItem), false, "without a validJournalIds set, the bare id is indistinguishable from any other non-journal sourceId");
assert.equal(isJournalItem(bareIdJournalItem, new Set([selectedJournal.id])), true, "a bare sourceId that matches a real catalog journal id must be recognized as a journal item");
const bareIdJournalSegment = buildBatchSegment(
  bareIdJournalItem,
  personaIdForBatchIndex(0),
  { index: 0 },
  new Set([selectedJournal.id])
);
assert.ok(bareIdJournalSegment.riskFlags.includes("narrative_review_card"), "a thin bare-id journal item must take the narrative-review path, not the forced four-section template");
assert.deepEqual(validateSegmentForApproval(bareIdJournalSegment), [], "a correctly-classified thin journal item must not be stuck with missing-intake failure language");

// Bug fixed 2026-07-12: buildBatchSegment's socialItem check only matched
// sourceType === "general_social", so verified_social items (X-monitored/
// verified-account posts) fell through to the generic non-journal,
// non-social branch, which unconditionally builds a full Background/
// Methods/Results/Discussion clinical template out of the tweet text -- a
// tweet essentially never has real Methods/Results content, so this always
// produced the same permanently-unapprovable missing-intake failure
// language. Confirmed against real stuck pending_review rows in production
// (a holiday-greeting tweet rendered with a fake "Methods:"/"Results:"
// structure).
const verifiedSocialItem: IngestedItem = {
  id: "onclive-holiday-post",
  sourceId: "x-onclive-holiday",
  title: "Social callout: @OncLive on OncLive",
  url: "https://x.com/OncLive/status/1",
  excerpt: "Happy Fourth of July! From all of us at OncLive, we wish you a safe and memorable holiday.",
  sourceName: "@OncLive",
  sourceType: "verified_social",
  rank: 5,
  author: "@OncLive"
};
const verifiedSocialSegment = buildBatchSegment(
  verifiedSocialItem,
  personaIdForBatchIndex(0),
  { index: 0 },
  new Set()
);
assert.doesNotMatch(verifiedSocialSegment.script, /\bMethods:|\bResults:|\bDiscussion:/, "a verified_social item must not be forced through the structured clinical template");
assert.match(verifiedSocialSegment.script, /calls out a post from/i);
assert.deepEqual(validateSegmentForApproval(verifiedSocialSegment), [], "a correctly-classified verified_social item must not be stuck with missing-intake failure language");

// X topic-search fallback cards (general_social citation) must pass
// filterBroadcastReadySegments so they appear in the pending pool and can be
// picked up by sortWeeklyReadySegmentsForSelection. Previously they were
// silently excluded because hasVerifiedBroadcastSource did not accept
// general_social — meaning all X conference fallback cards were invisible
// to "create 1 hour batch cards".
// Note: these cards do NOT have weekly_source_context — that flag is only
// added by buildAnnouncementSegment (the final "nothing found" fallback).
const xTopicSearchCard: Segment = {
  ...sponsorBase,
  id: "x-topic-search-card",
  title: "Social callout: @OncLive on ASCO Annual Meeting",
  summary: "@OncLive callout. ASCO data from the plenary session.",
  script: "TumorCrusher calls out a post from @OncLive. ASCO data from the plenary session.",
  contentType: "social_signal",
  citations: [{ label: "@OncLive: ASCO data", url: "https://x.com/OncLive/status/123", sourceType: "general_social" }],
  riskFlags: [
    WEEKLY_SOURCE_POOL_FLAG,
    `weekly_key:${weeklySourceWeekKey()}`,
    `source_id:${selectedConference.id}`
  ]
};
assert.equal(
  filterBroadcastReadySegments([xTopicSearchCard]).length,
  1,
  "X topic-search cards with general_social citations must pass filterBroadcastReadySegments"
);

// ---- Deck-filter coverage tests ----
// Every bad card type must be invisible to the operator across conferences,
// journals, and newspapers. buildConferenceCardDecks / buildJournalCardDecks /
// buildSourceCardDecks all call isSubstantiveDeckCard internally.

// 1. Announcement/fallback cards (weekly_source_context flag)
const announcementCard: Segment = {
  ...sponsorBase,
  id: "announcement-deck-test",
  title: "Weekly update: Selected Oncology Meeting",
  summary: "Selected Oncology Meeting: no new official or attributed source material yet this week.",
  script: "Selected Oncology Meeting is on the calendar for June 19 through 20, 2026. No fresh official program updates or attributed coverage came through this week.",
  contentType: "agenda_preview",
  citations: [{ label: "Selected Oncology Meeting", url: "https://example.com/meeting", sourceType: "official" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, "weekly_source_context", `weekly_key:${weeklySourceWeekKey()}`, `source_id:${selectedConference.id}`]
};
const conferenceDeckWithAnnouncement = buildConferenceCardDecks([announcementCard], [selectedConference]);
assert.equal(conferenceDeckWithAnnouncement[selectedConference.id]?.total, 0, "Announcement cards with weekly_source_context must be hidden from the conference deck");

// 2. Conference context shells (buildConferenceContextItem output → buildBatchSegment)
const contextShellSegment: Segment = {
  ...sponsorBase,
  id: "context-shell-deck-test",
  title: "Weekly update 2026-W26: SOM 2026 official conference context",
  summary: "SOM 2026 official conference context intake.",
  script: "Nova Quinn is covering Selected Oncology Meeting. The topic is SOM 2026 official conference context. Background: Official meeting context: Selected Oncology Meeting is listed as a Oncology meeting. Methods: Dates: 2026-06-19 through 2026-06-20. Results: Location: Chicago, USA. Discussion: Source: the official meeting page for Selected Oncology Meeting.",
  contentType: "agenda_preview",
  citations: [{ label: "Selected Oncology Meeting", url: "https://example.com/meeting", sourceType: "official" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, `weekly_key:${weeklySourceWeekKey()}`, `source_id:${selectedConference.id}`]
};
const conferenceDeckWithShell = buildConferenceCardDecks([contextShellSegment], [selectedConference]);
assert.equal(conferenceDeckWithShell[selectedConference.id]?.total, 0, "Conference context shell cards (official meeting context / is listed as a) must be hidden from the conference deck");

// 3. EHA-style program pages (topics-in-focus, guidelines, learning paths, cme credits)
const ehaProgramCard: Segment = {
  ...sponsorBase,
  id: "eha-program-deck-test",
  title: "Weekly update: EHA Topics-in-Focus Program",
  summary: "EHA congress platform. Topics-in-focus program and clinical practice guidelines.",
  script: "Nova Quinn is covering European Hematology Association Congress. Background: The EHA Topics-in-focus program offers clinical practice guidelines and learning paths for the European Hematology curriculum and cme credits. Methods: Specialized working groups support monitoring and career development. Results: Registration is open on the congress platform. Discussion: Onboarding sessions are available for members.",
  contentType: "agenda_preview",
  citations: [{ label: "EHA Official Program", url: "https://ehaweb.org/program", sourceType: "official" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, `weekly_key:${weeklySourceWeekKey()}`, `source_id:${ehaConference.id}`]
};
const ehaConferenceDeck = buildConferenceCardDecks([ehaProgramCard], [ehaConference]);
assert.equal(ehaConferenceDeck[ehaConference.id]?.total, 0, "EHA program/topics-in-focus/guidelines cards must be hidden from the conference deck");

// 4. Journal announcement card (weekly_source_context)
const journalAnnouncementCard: Segment = {
  ...sponsorBase,
  id: "journal-announcement-deck-test",
  title: "Weekly update: Annals of Oncology",
  summary: "Annals of Oncology: no new tracked articles this week.",
  script: "Annals of Oncology is one of the journals ConferenceHype tracks. No new articles came through this journal's feed this week.",
  contentType: "abstract_buzz",
  citations: [{ label: "Annals of Oncology", url: "https://www.annalsofoncology.org", sourceType: "official" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, "weekly_source_context", `weekly_key:${weeklySourceWeekKey()}`, `source_id:daily-journal-${selectedJournal.id}`]
};
const journalDeckWithAnnouncement = buildJournalCardDecks([journalAnnouncementCard], [selectedJournal]);
assert.equal(journalDeckWithAnnouncement[selectedJournal.id]?.total, 0, "Journal announcement cards with weekly_source_context must be hidden from the journal deck");

// 5. Newspaper/source announcement card (weekly_source_context)
const sourceAnnouncementCard: Segment = {
  ...sponsorBase,
  id: "source-announcement-deck-test",
  title: "Weekly update: OncLive",
  summary: "OncLive: no new attributed items this week.",
  script: "OncLive is one of the clinical news sources ConferenceHype monitors. No new attributed items came through this source this week.",
  contentType: "media_roundup",
  citations: [{ label: "OncLive", url: "https://www.onclive.com", sourceType: "media" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, "weekly_source_context", `weekly_key:${weeklySourceWeekKey()}`, "source_id:onclive"]
};
const sourceDeck = buildSourceCardDecks([sourceAnnouncementCard], [{ id: "onclive" }]);
assert.equal(sourceDeck["onclive"]?.total, 0, "Source/newspaper announcement cards with weekly_source_context must be hidden from the source deck");

// 6. Real clinical content must still appear in the deck
const realClinicalCard: Segment = {
  ...sponsorBase,
  id: "real-clinical-deck-test",
  title: "Weekly update 2026-W26: Phase III CARTITUDE-4 results in multiple myeloma",
  summary: "From the June 2026 edition of The Lancet. Background: CARTITUDE-4 evaluated ciltacabtagene autoleucel in relapsed/refractory myeloma.",
  script: "From the June 2026 edition of The Lancet, this journal review looks at phase III CARTITUDE-4 results in multiple myeloma. Background: CARTITUDE-4 evaluated ciltacabtagene autoleucel in relapsed/refractory myeloma. Methods: 419 patients were randomized to cilta-cel or standard of care. Results: PFS was significantly improved with cilta-cel. Discussion: These findings support earlier use of CAR-T therapy in myeloma.",
  contentType: "abstract_buzz",
  citations: [{ label: "The Lancet: CARTITUDE-4", url: "https://example.com/cartitude", sourceType: "media" }],
  riskFlags: [WEEKLY_SOURCE_POOL_FLAG, `weekly_key:${weeklySourceWeekKey()}`, `source_id:daily-journal-${selectedJournal.id}`]
};
const journalDeckWithReal = buildJournalCardDecks([realClinicalCard], [selectedJournal]);
assert.equal(journalDeckWithReal[selectedJournal.id]?.total, 1, "Real clinical content must still appear in the journal deck");

const releaseAllRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/admin/approve/release-all/route.ts"),
  "utf8"
);
assert.match(
  releaseAllRouteSource,
  /weeklyPool\.filter\(\(segment\) => !approvedIds\.has\(segment\.id\)\)/,
  "Release-all must return skipped weekly cards to their source decks"
);
assert.match(
  releaseAllRouteSource,
  /bulkRemoveSegmentRiskFlagInDb\([\s\S]*WEEKLY_SOURCE_POOL_FLAG/,
  "Release-all must remove the weekly-pool marker from skipped cards"
);
const dbSource = readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8");
assert.match(
  dbSource,
  /\.eq\("status", "pending_review"\)/,
  "Returning cards to source decks must not alter non-pending cards"
);

(async () => {
  const enrichedXPost = await buildPubMedBackedJournalItem(conferenceLinkedXPost, new Set());
  assert.equal(enrichedXPost, conferenceLinkedXPost);
  const xPostSegment = buildBatchSegment(
    enrichedXPost!,
    personaIdForBatchIndex(0),
    {
      startsAt: "2026-06-22T16:00:00.000Z",
      index: 0
    },
    new Set()
  );
  assert.equal(xPostSegment.contentType, "social_signal");
  assert.deepEqual(validateSegmentForApproval(xPostSegment), []);

  console.log("Broadcast guard verification passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
