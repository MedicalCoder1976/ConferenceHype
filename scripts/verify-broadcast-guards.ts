import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatVoiceSegment, SEGMENT_CLOSE } from "@/lib/broadcast/voiceSegment";
import { buildBroadcastSlots } from "@/lib/rundown/slots";
import { applySpokenPronunciations } from "@/lib/media/tts";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { buildConferenceContextItem, itemMatchesSelections } from "@/lib/intakeCards";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import { filterBroadcastReadySegments } from "@/lib/data";
import { normalizeLegacyDailyCoverageDefaults } from "@/lib/dailyCoverage";
import {
  segmentSourceMatchesSelection,
  sortWeeklyReadySegmentsForSelection,
  WEEKLY_SOURCE_POOL_FLAG
} from "@/lib/weeklySourceCards";
import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";
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
  topic: "late-breaking sessions",
  narrative: "The official program has published a schedule update with source-attributed detail.",
  at: new Date("2026-06-11T13:00:00Z"),
  cardIndex: 3
});
assert.ok(fourthFramed.endsWith(SEGMENT_CLOSE));
assert.doesNotMatch(framed, /interactive AI commentary only/i);
assert.equal(applySpokenPronunciations("ASCO 2026 and Ib disease"), "Ask-ho 2026 and one B disease");

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
assert.match(renderHourSource, /framedCards\.push\(musicTransitionCard\(remainingSeconds/);
assert.match(renderHourSource, /durationSeconds = Math\.min\(Number\(process\.env\.HOUR_BROADCAST_SECONDS \?\? 3600\), 3600\)/);

console.log("Broadcast guard verification passed.");
