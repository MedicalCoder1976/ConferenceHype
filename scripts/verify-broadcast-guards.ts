import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeBroadcastCopy } from "@/lib/broadcast/sanitizeCopy";
import { formatVoiceSegment, SEGMENT_CLOSE } from "@/lib/broadcast/voiceSegment";
import { buildBroadcastSlots, buildJournalShowSlots } from "@/lib/rundown/slots";
import { assertSearchOptimizedBroadcastMetadata, buildBroadcastMetadata, extractExplicitStudyName, extractExplicitStudyNames } from "@/lib/youtube/broadcastMetadata";
import { applySpokenPronunciations, extractSpokenAbbreviationDefinitions } from "@/lib/media/tts";
import { buildClinicalEvidencePackaging, buildJournalClubYoutubeTitle, extractClinicalTopic } from "@/lib/youtube/clinicalEvidencePackaging";
import { buildMeetingWatchSlots, groupMeetingWatchSegmentsByTrial } from "@/lib/rundown/meetingWatchSlots";
import { parsePreparedNarrative, preparedNarrativeSegments } from "@/lib/meetingWatch/preparedNarrative";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { assertMinimumSubstantiveCards, minimumSubstantiveCards, parseVolumeDetect } from "@/lib/media/broadcastQuality";
import { buildConferenceCardDecks, buildJournalCardDecks, buildSourceCardDecks, isJournalVerticalSegment } from "@/lib/cardDeck";
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
import { buildEvidenceDashboardSvg } from "@/lib/broadcast/evidenceDashboard";
import { assertSafePaperUrl, parsePaperHtml, parsePubMedXml } from "@/lib/breakingPaper";
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

const gapClipGeneratorSource = readFileSync(path.join(process.cwd(), "scripts", "generate-licensed-gap-clips.ps1"), "utf8");
const gapClipManifestSource = readFileSync(path.join(process.cwd(), "public", "music", "gap-clips", "manifest.json"), "utf8");
assert.doesNotMatch(gapClipGeneratorSource, /This is ConferenceHype\. Stay with us/i);
assert.doesNotMatch(gapClipManifestSource, /This is ConferenceHype\. Stay with us/i);
assert.match(gapClipGeneratorSource, /Music handoffs are intentionally music-only/);

import { dedupeAgainstFreshSegments } from "@/lib/weeklySourceCardGeneration";
import type { IngestedItem, Segment } from "@/lib/types";
import { normalizeJournalPublicationDate } from "@/lib/station/journalCadence";

assert.equal(
  extractClinicalTopic("This all comes with real political weight attached.", "Big Pharma Merger Talks"),
  "Big Pharma Merger Talks",
  "ordinary lowercase all must never resolve as acute lymphoblastic leukemia"
);
assert.equal(extractClinicalTopic("An ALL trial update"), "Acute Lymphoblastic Leukemia");
assert.equal(extractClinicalTopic("Acute lymphoblastic leukemia trial update"), "Acute Lymphoblastic Leukemia");
assert.equal(normalizeJournalPublicationDate("2026 Jul 31"), "2026-07-31");
assert.equal(normalizeJournalPublicationDate("Tue, 28 Jul 2026 00:00:00 GMT"), "2026-07-28");
assert.equal(normalizeJournalPublicationDate("2026-07-31T07:00:00Z"), "2026-07-31");
assert.equal(normalizeJournalPublicationDate("not a date"), undefined);

const youtubeDeliveryWorkflowSource = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "youtube-delivery-daily-verify.yml"),
  "utf8"
);
assert.match(
  youtubeDeliveryWorkflowSource,
  /if \[ "\$\{YOUTUBE_STATUS\}" = "queued" \]; then[\s\S]*VERIFY_PHASE="queued"/,
  "Daily delivery verification must accept queued as the terminal success state for render-then-upload broadcasts"
);

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
);assert.equal(
  applySpokenPronunciations("PFS was reported in Jul and updated in Aug.", "The article defined progression-free survival (PFS)."),
  "progression-free survival was reported in July and updated in August."
);
assert.equal(applySpokenPronunciations("PFS was reported.", "The source does not define it."), "PFS was reported.");
// Bug fixed 2026-07-30: only Jul/Aug were expanded to full month names;
// Jun (and every other short-form month) was left for Kokoro to mis-read
// instead of saying "June". All 12 abbreviations must expand; May is a
// no-op since the short and long forms are identical.
assert.equal(
  applySpokenPronunciations("Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec"),
  "January February March April May June July August September September October November December"
);
assert.equal(applySpokenPronunciations("Published Jun. 2026."), "Published June. 2026.");
{
  const largeContext = Array.from({ length: 75 }, (_, index) => `Card ${index + 1}: progression-free survival (PFS) was assessed in Jul.`).join(" ");
  const started = performance.now();
  const definitions = extractSpokenAbbreviationDefinitions(largeContext);
  for (let index = 0; index < 75; index += 1) applySpokenPronunciations(`PFS update ${index + 1} in Aug.`, definitions);
  const elapsedMs = performance.now() - started;
  assert.ok(elapsedMs < 1_000, `Pronunciation preprocessing took ${elapsedMs.toFixed(1)}ms for 75 turns.`);
  assert.equal(definitions.get("PFS"), "progression-free survival");
}

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
assert.match(metadataWithoutOverride.title, /^Test Journal: Internal Medicine Update - New Internal Medicine Research/);
const metadataWithOverride = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-03-15"
});
assert.equal(metadataWithOverride.dateLabel, "Mar 2026");
assert.doesNotMatch(metadataWithOverride.title, /ConferenceHype|2026/);
assert.match(
  metadataWithOverride.description,
  /Journals and publication dates covered: Test Journal \(publication date unavailable\)\./
);
const legacyNeurologyMetadata = buildBroadcastMetadata({
  hourStart: metadataHourStart,
  slots: journalShowSlots,
  journalsById: new Map([[journalShowJournalId, { ...journalShowTestJournal, name: "Neurology", specialty: "Others" }]])
});
assert.match(legacyNeurologyMetadata.title, /^Neurology: Neurology Update - New Neurology Research/);
assert.doesNotMatch(`${legacyNeurologyMetadata.title} ${legacyNeurologyMetadata.description} ${legacyNeurologyMetadata.tags.join(" ")}`, /\bOthers\b/);

assert.equal(extractExplicitStudyName("V-NE Ulcer Study 6: randomized findings"), "V-NE Ulcer Study 6");
assert.equal(extractExplicitStudyName("Results from NCT01234567 in adults"), "NCT01234567");
assert.equal(extractExplicitStudyName("ISRCTN registration was planned"), undefined);
assert.deepEqual(extractExplicitStudyNames("NCT01234567 reports the ILUSTRO study"), ["ILUSTRO study", "NCT01234567"]);
assert.equal(extractExplicitStudyName("A randomized controlled trial in adults"), undefined);
assert.deepEqual(
  extractExplicitStudyNames("The ILUSTRO study was followed by the POLAR trial and RESOLUTION Trial."),
  ["ILUSTRO study", "POLAR trial", "RESOLUTION Trial"]
);
assert.equal(extractExplicitStudyName("AI triage in the LungIMPACT randomized controlled trial"), "LungIMPACT trial");
assert.equal(extractExplicitStudyName("The LungIMPACT trial evaluated AI triage"), "LungIMPACT trial");
const oncologyPackaging = buildClinicalEvidencePackaging({
  title: "FLAURA2 trial: overall survival results with osimertinib",
  specialty: "Oncology",
  sourceText: "The FLAURA2 trial evaluated osimertinib in EGFR-mutated non-small cell lung cancer.",
  studyNames: ["FLAURA2 trial"]
});
assert.equal(oncologyPackaging.clinicalTopic, "Lung Cancer");
assert.match(oncologyPackaging.youtubeTitle, /^Lung Cancer: FLAURA2 trial/);
assert.equal(oncologyPackaging.thumbnailEntity, "FLAURA2 trial");
assert.doesNotMatch(oncologyPackaging.youtubeTitle, /^ConferenceHype|Physician Education/);
const lungCancerJournalMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: journalShowSlots.map((slot) => slot.segment && !slot.segment.riskFlags.includes("journal_show_outro")
    ? { ...slot, segment: { ...slot.segment, title: "Lung cancer treatment evidence" } }
    : slot),
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01"
});
assert.match(lungCancerJournalMetadata.description, /Relevant specialties: Internal Medicine; Oncology\./);
assert.match(lungCancerJournalMetadata.description, /Audience: Internists; Oncologists; Physicians; Advanced Practice Providers \(APPs\)\./);
assert.ok(lungCancerJournalMetadata.tags.includes("Oncology"));
assert.ok(lungCancerJournalMetadata.tags.includes("Oncologists"));
const cardiologyPackaging = buildClinicalEvidencePackaging({
  title: "Novo Nordisk heart medicine fails trial: ZEUS cut inflammation, not heart attacks",
  specialty: "Cardiology",
  sourceText: "ZEUS evaluated cardiovascular events and heart attacks.",
  studyNames: ["ZEUS trial"]
});
assert.equal(cardiologyPackaging.clinicalTopic, "Coronary Artery Disease");
assert.match(cardiologyPackaging.youtubeTitle, /^Coronary Artery Disease: ZEUS trial/);
const storyPackaging = buildClinicalEvidencePackaging({
  title: "How GLP-1 medicines changed obesity care",
  specialty: "Story",
  explicitTopic: "Obesity Care",
  sourceText: "A narrative about obesity treatment."
});
assert.equal(storyPackaging.clinicalTopic, "Obesity");
assert.match(storyPackaging.youtubeTitle, /^Obesity:/);
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
assert.match(optimizedStudyMetadata.title, /^Test Journal: Internal Medicine Update - New Internal Medicine Research/);
assert.match(optimizedStudyMetadata.description, /^Internal Medicine Journal Club\nJournal: Test Journal\.\nRelevant specialties: Internal Medicine\.\nAudience: Internists; Physicians; Advanced Practice Providers \(APPs\)\.\nNamed studies covered: V-NE Ulcer Study 6\./);
assert.ok(optimizedStudyMetadata.tags.includes("Physicians"));
assert.ok(optimizedStudyMetadata.tags.includes("Advanced Practice Providers"));
assert.ok(optimizedStudyMetadata.tags.includes("APPs"));
assert.equal(optimizedStudyMetadata.tags[0], "V-NE Ulcer Study 6");
assert.equal(optimizedStudyMetadata.thumbnailHeadline, "randomized findings");
assert.equal(optimizedStudyMetadata.thumbnailEntity, "V-NE Ulcer Study 6");
assert.deepEqual(optimizedStudyMetadata.thumbnailJournalNames, [journalShowTestJournal.name]);
assert.equal(optimizedStudyMetadata.thumbnailJournalCount, 1);
assert.doesNotThrow(() => assertSearchOptimizedBroadcastMetadata(optimizedStudyMetadata));
assert.throws(() => assertSearchOptimizedBroadcastMetadata(optimizedStudyMetadata, { requireJournalContext: true }), /publication month and year/);
assert.throws(
  () => assertSearchOptimizedBroadcastMetadata({ ...optimizedStudyMetadata, description: "Missing study line" }),
  /Every named study/
);
assert.throws(
  () => assertSearchOptimizedBroadcastMetadata({ ...optimizedStudyMetadata, thumbnailHeadline: undefined }),
  /thumbnail headline/
);
assert.deepEqual(optimizedStudyMetadata.studyNames, ["V-NE Ulcer Study 6"]);
const longStudyName = "Alpha Beta Gamma Delta HARMONi trial 123A";
const longStudySlots = journalShowSlots.map((slot, index) => index === firstStudySlotIndex && slot.segment
  ? { ...slot, segment: { ...slot.segment, title: `${longStudyName}: final results` } }
  : slot);
const longStudyMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: longStudySlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01"
});
assert.equal(longStudyMetadata.studyNames[0], longStudyName);
assert.match(longStudyMetadata.thumbnailEntity ?? "", /^Alpha Beta Gamma Delta HARMONi\.\.\.$/);
assert.doesNotThrow(() => assertSearchOptimizedBroadcastMetadata(longStudyMetadata));
assert.throws(
  () => assertSearchOptimizedBroadcastMetadata({ ...longStudyMetadata, thumbnailEntity: "Different trial" }),
  /thumbnail must identify/
);
for (const studyName of optimizedStudyMetadata.studyNames) {
  assert.ok(optimizedStudyMetadata.description.includes(studyName), `${studyName} must appear in the description.`);
}
const firstStudySegmentId = studyNamedSlots[firstStudySlotIndex].segment!.id;
const abstractNamedMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: journalShowSlots,
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01",
  studySourceTextBySegmentId: new Map([[firstStudySegmentId, "Methods from the PREDICT study were prespecified."]])
});
assert.match(abstractNamedMetadata.title, /^Test Journal: Internal Medicine Update - New Internal Medicine Research/);
assert.equal(abstractNamedMetadata.tags[0], "PREDICT study");
assert.match(abstractNamedMetadata.description, /Named studies covered: PREDICT study/);
const registryOnlyMetadata = buildBroadcastMetadata({
  hourStart: new Date("2026-07-24T13:00:00Z"),
  slots: journalShowSlots.map((slot, index) => index === firstStudySlotIndex && slot.segment
    ? { ...slot, segment: { ...slot.segment, title: "NCT01234567: randomized findings" } }
    : slot),
  journalsById: journalShowJournalsById,
  titleDateOverride: "2026-07-01"
});
assert.deepEqual(registryOnlyMetadata.studyNames, []);
assert.doesNotMatch(`${registryOnlyMetadata.title}\n${registryOnlyMetadata.description}\n${registryOnlyMetadata.tags.join(" ")}`, /NCT01234567|Multiple Cancers/i);
assert.equal(metadataWithoutOverride.thumbnailHeadline, "Journal show topic 0");
assert.equal(metadataWithoutOverride.clinicalTopic, "Internal Medicine");
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

const reviewQueueSource = readFileSync(
  path.join(process.cwd(), "components", "ReviewQueue.tsx"),
  "utf8"
);
assert.match(reviewQueueSource, /Journal cards awaiting approval/);
assert.match(reviewQueueSource, /\/api\/admin\/approve\/release-all/);
assert.match(reviewQueueSource, /window\.confirm/);
assert.match(reviewQueueSource, /View all cards/);
const adminPageSource = readFileSync(path.join(process.cwd(), "app", "admin", "page.tsx"), "utf8");
assert.doesNotMatch(adminPageSource, /<ReviewQueue segments=\{snapshot\.pendingSegments\}/);
assert.match(adminPageSource, /<ReviewQueue segments=\{journalReviewSegments\}/);
assert.match(adminPageSource, /fullDeckInventory: false/);
assert.equal(
  readFileSync(path.join(process.cwd(), "app", "admin", "loading.tsx"), "utf8").includes("Opening admin"), true
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
const requiredPsychiatryJournals = [
  "JAMA Psychiatry",
  "American Journal of Psychiatry",
  "The British Journal of Psychiatry",
  "Molecular Psychiatry",
  "World Psychiatry",
  "Psychiatric Services",
  "Journal of Child Psychology and Psychiatry"
];
for (const name of requiredPsychiatryJournals) {
  assert.equal(
    oncologyJournalSeeds.find((journal) => journal.name === name)?.specialty,
    "Psychiatry",
    `${name} must remain in Psychiatry`
  );
}
assert.equal(
  oncologyJournalSeeds.find(
    (journal) => journal.name === "Journal of Neurology, Neurosurgery & Psychiatry"
  )?.specialty,
  "Neurology"
);
const journalDbSource = readFileSync(path.join(process.cwd(), "lib", "db.ts"), "utf8");
assert.doesNotMatch(
  journalDbSource,
  /onConflict:\s*"rss_url",\s*ignoreDuplicates:\s*true/,
  "journal seed synchronization must update corrected metadata"
);

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
// auto-links Ã¢â‚¬â€ and unrelated entities must not get a false-positive match.
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


const meetingWatchWorkflowSource = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "meeting-watch-broadcast.yml"),
  "utf8"
);
assert.match(meetingWatchWorkflowSource, /timeout-minutes: 90/);
assert.match(meetingWatchWorkflowSource, /actions\/cache@v4/);
assert.match(meetingWatchWorkflowSource, /Render heartbeat expired before YouTube upload completed/);
assert.match(meetingWatchWorkflowSource, /needs\.broadcast\.result != 'success'/);
assert.match(meetingWatchWorkflowSource, /cancelled or timed-out Meeting Watch delivery/i);
assert.match(meetingWatchWorkflowSource, /YOUTUBE_PUBLISH_AT: \$\{\{ steps\.resolve\.outputs\.starts_at \}\}/);
const renderHourSource = readFileSync(
  path.join(process.cwd(), "scripts", "render-hour-broadcast.ts"),
  "utf8"
);
assert.match(renderHourSource, /function enforceOneHourFrame/);
// Single-journal shows use 30 minutes only as a ceiling; they must not add
// trailing music merely to make the uploaded video exactly 30:00.
assert.match(renderHourSource, /const shouldPadToFrame = !isJournalMode/);
assert.match(renderHourSource, /remainingSeconds > 0 && padToFrame/);
assert.match(renderHourSource, /delta > 0\.001 && !isJournalMode/);
assert.match(renderHourSource, /const NARRATION_START_DELAY_SECONDS = 2/);
assert.match(renderHourSource, /reserveOpeningNarrationDelay/);
assert.match(renderHourSource, /volume=0\.85,adelay=2000\|2000\[voice\]/);
assert.match(renderHourSource, /Narration overlap detected/);
assert.match(renderHourSource, /const pronunciationDefinitions = new Map/);
assert.match(renderHourSource, /applySpokenPronunciations\(card\.script, pronunciationDefinitions\.get/);
assert.match(renderHourSource, /const STORY_NARRATION_SPEED = 1\.05/);
assert.match(renderHourSource, /card\.riskFlags\?\.includes\("prepared_story"\) \? STORY_NARRATION_SPEED : 1\.15/);
assert.match(renderHourSource, /\$\{persona\.voiceEnvKey\}\|\$\{speed\}\|\$\{processedScript\}/);
const preparedStorySource = readFileSync(path.resolve("lib/story/preparedStory.ts"), "utf8");
assert.match(preparedStorySource, /STORY_WORDS_PER_SECOND_AT_MEASURED_PACE = 1\.95/);
assert.match(preparedStorySource, /prepared_thumbnail:\$\{story\.input\.thumbnailHeadline\}/);
assert.match(preparedStorySource, /maskDecimalPoints/);
const storyDeskSource = readFileSync(path.resolve("components/StoryDesk.tsx"), "utf8");
assert.match(storyDeskSource, /Develop and publish YouTube video/);
assert.match(storyDeskSource, /\/api\/admin\/story\/status\?broadcastId=/);
assert.match(storyDeskSource, /conferencehype:last-story-broadcast-id/);
assert.doesNotMatch(storyDeskSource, /approvedPackaging|approvedCards|approvedSource|Validate and build video preview/);
const storyStatusSource = readFileSync(path.resolve("app/api/admin/story/status/route.ts"), "utf8");
assert.match(storyStatusSource, /youtube\.com\/oembed/);
assert.match(storyStatusSource, /data\.status === "verified"/);
assert.match(readFileSync(path.resolve("lib/youtube/uploadBroadcastVideo.ts"), "utf8"), /YouTube did not confirm public visibility/);
const clinicalPackagingSource = readFileSync(path.resolve("lib/youtube/clinicalEvidencePackaging.ts"), "utf8");
assert.equal(
  buildJournalClubYoutubeTitle("Advances in Radiation Oncology: Cervical Cancer - New Research", "Radiology / Radiation Oncology"),
  "JOURNAL CLUB | Radiation Oncologists and Radiologists | Advances in Radiation Oncology: Cervical..."
);
assert.match(clinicalPackagingSource, /addSpecialistAudienceToTitle/);
assert.match(clinicalPackagingSource, /buildJournalClubYoutubeTitle/);
assert.match(clinicalPackagingSource, /JOURNAL CLUB \| \$\{audience\} \|/);
assert.match(clinicalPackagingSource, /"Radiology \/ Radiation Oncology": "Radiation Oncologists and Radiologists"/);
assert.match(clinicalPackagingSource, /Cardiology: "Cardiologists"/);
assert.match(clinicalPackagingSource, /Gastroenterology: "Gastroenterologists"/);
assert.match(renderHourSource, /isJournalMode[\s\S]*buildJournalClubYoutubeTitle\(baseTitle, actualMetadata\?\.specialty\)/);
const voiceSegmentSource = readFileSync(path.resolve("lib/broadcast/voiceSegment.ts"), "utf8");
assert.match(voiceSegmentSource, /resultsFirstStructuredNarrative/);
assert.match(voiceSegmentSource, /\["Results", sectionText\(value, "Results"\)\]/);
const youtubeThumbnailSource = readFileSync(path.resolve("app/api/youtube-thumbnail/route.tsx"), "utf8");
assert.match(youtubeThumbnailSource, />JOURNAL CLUB</);
assert.match(youtubeThumbnailSource, /fontSize: 52/);
assert.match(youtubeThumbnailSource, /isJournalClub && journal && specialty && articleTitle/);
assert.doesNotMatch(youtubeThumbnailSource.match(/if \(isJournalClub[\s\S]*?return new ImageResponse[\s\S]*?\n  \}/)?.[0] ?? "", /truncate\(articleTitle/);
assert.doesNotMatch(youtubeThumbnailSource.match(/if \(isJournalClub[\s\S]*?return new ImageResponse[\s\S]*?\n  \}/)?.[0] ?? "", />CONFERENCEHYPE</);
assert.match(renderHourSource, /journalClub: isJournalMode/);
assert.match(renderHourSource, /articleTitle: isJournalMode \? actualMetadata\?\.thumbnailArticleTitle/);
assert.match(renderHourSource, /\(process\.env\.STATION_PROGRAM_ID \|\| isMeetingWatchMode\) \? process\.env\.YOUTUBE_PUBLISH_AT/);
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
assert.match(renderHourSource, /headline: actualMetadata\?\.thumbnailHook/);
assert.match(renderHourSource, /topicLabel: isBreakingMode/);
assert.match(renderHourSource, /entityLabel: actualMetadata\?\.thumbnailEntity/);
assert.match(renderHourSource, /seriesLabel: "CLINICAL EVIDENCE BRIEF"/);
assert.match(renderHourSource, /seriesHeadline: isBreakingMode \? "Clinical Evidence Brief: Breaking Paper" : "Clinical Evidence Brief"/);
assert.match(renderHourSource, /actualMetadata\?\.title \|\|\s+process\.env\.BROADCAST_TITLE/);
assert.doesNotMatch(renderHourSource, /Physician Education/);
assert.doesNotMatch(renderHourSource, /headline: isBreakingMode/);
assert.match(renderHourSource, /const OPENING_TITLE_SECONDS = 8/);
assert.match(renderHourSource, /const PERSISTENT_BRANDING_START_DATE = "2026-07-28"/);
assert.match(renderHourSource, /burnOpeningThumbnailIntoVideo/);
assert.match(renderHourSource, /overlay=0:0:shortest=1:enable='between\(t,0,\$\{OPENING_TITLE_SECONDS\}\)'/);
assert.match(renderHourSource, /showwaves=s=610x38:mode=cline/);
assert.match(renderHourSource, /variant: "persistent-frame"/);
assert.match(renderHourSource, /thumbnailBytes: openingThumbnailBytes/);
assert.match(renderHourSource, /"BREAKING MEDICAL RESEARCH"/);
assert.match(renderHourSource, /assertSearchOptimizedBroadcastMetadata/);
assert.match(renderHourSource, /if \(isJournalMode \|\| isMeetingWatchMode \|\| process\.env\.STATION_PROGRAM_ID\) throw error/);
assert.match(renderHourSource, /buildEvidenceDashboardSvg/);
assert.match(renderHourSource, /await sharp\(Buffer\.from\(evidenceDashboard\)\)\.png\(\)\.toFile\(imagePath\)/);
assert.doesNotMatch(renderHourSource, /color=c=\$\{color\}:s=1280x720/);
const evidenceDashboardSvg = buildEvidenceDashboardSvg({
  title: "EMERALD-3 randomized trial",
  text: "Background: TACE alone was standard care. Methods: Patients were randomized. Results: Progression-free survival improved. Discussion: Benefit must be balanced against toxicity.",
  sourceLabel: "Journal of Clinical Oncology - July 2026",
  contentType: "abstract_buzz",
  isMusic: false,
  index: 2,
  total: 12
});
assert.match(evidenceDashboardSvg, /EVIDENCE/);
assert.match(evidenceDashboardSvg, /Progression-free survival improved/);
assert.doesNotMatch(evidenceDashboardSvg, /KEY FINDING|STUDY SNAPSHOT|WHY IT MATTERS/);
assert.doesNotMatch(evidenceDashboardSvg, /Journal of Clinical Oncology/);
const journalEducationSvg = buildEvidenceDashboardSvg({
  title: "EMERALD-3 randomized trial",
  text: "Results: Progression-free survival improved.",
  sourceLabel: "Journal of Clinical Oncology - July 2026",
  contentType: "abstract_buzz",
  isMusic: false,
  index: 2,
  total: 12,
  seriesHeadline: "Clinical Evidence Brief",
  featureLabel: "EMERALD-3 randomized trial"
});
assert.match(journalEducationSvg, /Clinical Evidence Brief/);
assert.match(journalEducationSvg, /CONFERENCEHYPE/);
assert.doesNotMatch(journalEducationSvg, new RegExp(["PHYSICIAN", "EDUCATION"].join("\s+"), "i"));
assert.match(journalEducationSvg, /EMERALD-3 randomized trial/);
const evidenceOpeningSvg = buildEvidenceDashboardSvg({
  title: "TumorCrusher / Media Watch EMERALD-3 randomized trial",
  text: "Results: Progression-free survival improved.",
  sourceLabel: "Journal of Clinical Oncology - July 2026",
  contentType: "media_roundup",
  isMusic: false,
  isOpening: true,
  index: 0,
  total: 12
});
assert.match(evidenceOpeningSvg, /ARTICLE REVIEW/);
assert.match(evidenceOpeningSvg, /Journal of Clinical Oncology/);
assert.doesNotMatch(evidenceOpeningSvg, /TumorCrusher|Media Watch/);
const continuedEvidenceSvg = buildEvidenceDashboardSvg({
  title: "EMERALD-3 randomized trial",
  previousTitle: "EMERALD-3 randomized trial",
  text: "Results: The second narrated finding adds safety context.",
  isMusic: false,
  index: 3,
  total: 12
});
assert.doesNotMatch(continuedEvidenceSvg, /EMERALD-3 randomized trial/);
assert.match(continuedEvidenceSvg, /second narrated finding adds safety context/);
const closingMusicSvg = buildEvidenceDashboardSvg({
  isMusic: true,
  text: "",
  index: 11,
  total: 12
});
assert.match(closingMusicSvg, /Like and subscribe/);
assert.match(closingMusicSvg, /recommend an article or trial/);
// Bug fixed 2026-07-30: the non-closing "Coming Next" transition slide used
// to show inert filler ("A brief music transition...") instead of asking
// viewers to like/subscribe/suggest journals -- only the final closing slide
// of the whole broadcast carried that CTA. Every transition slide should.
const comingNextMusicSvg = buildEvidenceDashboardSvg({
  isMusic: true,
  text: "",
  nextTitle: "Stroke after aortic arch surgery with short circulatory arrest times",
  index: 5,
  total: 12
});
assert.match(comingNextMusicSvg, /COMING NEXT/);
assert.match(comingNextMusicSvg, /Like and subscribe/);
assert.match(comingNextMusicSvg, /which journals/);
assert.match(comingNextMusicSvg, /cover next/);
assert.doesNotMatch(comingNextMusicSvg, /brief music transition/);
// Bug fixed 2026-07-30: stripSlideDescriptors' "Journal Coverage" label-strip
// regex was unanchored, so it deleted that phrase anywhere it appeared --
// including as real title content. The outro card title "End of journal
// coverage" (lib/rundown/slots.ts) lost everything after "End of" on a real
// aired broadcast. Confirmed fixed by anchoring the strip to the start (^).
const outroCardMusicSvg = buildEvidenceDashboardSvg({
  isMusic: true,
  text: "",
  nextTitle: "End of journal coverage",
  index: 10,
  total: 12
});
assert.match(outroCardMusicSvg, />End of journal coverage</);
// Bug fixed 2026-07-30: wrap()'s line-break loop dropped the overflow word
// silently when it landed exactly on a maxCharacters boundary (no ellipsis,
// title just stopped mid-thought), and truncate() appended a mojibake
// "â€¦" instead of a real ellipsis and could cut mid-word. Long titles must
// now always end in a real "…" when truncated, never a bare cutoff.
const longTitleMusicSvg = buildEvidenceDashboardSvg({
  isMusic: true,
  text: "",
  nextTitle: "Stroke after aortic arch surgery with short circulatory arrest times: The effect of deep hypothermic circulatory arrest on neurologic outcomes",
  index: 5,
  total: 12
});
assert.match(longTitleMusicSvg, /…<\/tspan><\/text>/);
assert.doesNotMatch(longTitleMusicSvg, /â€¦/);
assert.doesNotMatch(longTitleMusicSvg, /times: The<\/tspan>/);
const thumbnailRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "youtube-thumbnail", "route.tsx"), "utf8");
assert.match(thumbnailRouteSource, /params\.get\("headline"\)/);
assert.match(thumbnailRouteSource, /params\.getAll\("journalName"\)/);
assert.match(thumbnailRouteSource, /FEATURED JOURNALS/);
assert.doesNotMatch(thumbnailRouteSource, new RegExp(["source", "grounded"].join("[- ]"), "i"));
assert.match(thumbnailRouteSource, /WHY THIS RESULT MATTERS/);
assert.match(thumbnailRouteSource, /remainingJournalCount/);
assert.match(thumbnailRouteSource, /seriesLabel/);
assert.match(thumbnailRouteSource, /detailLabel/);
assert.match(thumbnailRouteSource, /persistent-frame/);
assert.match(thumbnailRouteSource, /promiseLabel/);
assert.match(thumbnailRouteSource, /params\.get\("topicLabel"\)/);
assert.match(thumbnailRouteSource, /params\.get\("entityLabel"\)/);
assert.match(thumbnailRouteSource, /fontSize: headline\.length > 42 \? 64 : 78/);
assert.match(thumbnailRouteSource, /color: COLORS\.gold/);
assert.match(thumbnailRouteSource, /NEW EVIDENCE/);
assert.doesNotMatch(thumbnailRouteSource, />\?<\/div>/);
const stationMetadataSource = readFileSync(path.join(process.cwd(), "scripts", "refresh-station-video-metadata.ts"), "utf8");
assert.match(stationMetadataSource, /updateYoutubeVideoMetadata/);
assert.match(stationMetadataSource, /uploadYoutubeThumbnail/);
assert.match(stationMetadataSource, /STATION_METADATA_ALL_RELEASED/);
assert.match(stationMetadataSource, /STATION_METADATA_DRY_RUN/);
assert.match(stationMetadataSource, /refreshedVideoIds/);
assert.match(stationMetadataSource, /assertSearchOptimizedBroadcastMetadata/);
assert.doesNotMatch(stationMetadataSource, /uploadVideoToYoutube/);

const adminTabsSource = readFileSync(path.join(process.cwd(), "components", "AdminTabs.tsx"), "utf8");
const twitterStreamDeskSource = readFileSync(path.join(process.cwd(), "components", "TwitterStreamDesk.tsx"), "utf8");
assert.match(adminTabsSource, /twitter-stream/);
assert.match(adminTabsSource, /Twitter Stream/);
assert.match(twitterStreamDeskSource, /program\.status === "verified"/);
assert.match(twitterStreamDeskSource, /schedule\.scheduleDate < today/);
assert.match(twitterStreamDeskSource, /hours \* 2/);
assert.match(twitterStreamDeskSource, /index \* 30/);
assert.match(twitterStreamDeskSource, /without new rendering or AI cost/);
assert.match(twitterStreamDeskSource, /private test/);

const weekdayReleaseSource = readFileSync(path.join(process.cwd(), "scripts", "prepare-weekday-station.ts"), "utf8");
const weekdayReleaseWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
const stationProgramWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "station-program.yml"), "utf8");
const prepareWeekdayStationSource = readFileSync(path.join(process.cwd(), "scripts", "prepare-weekday-station.ts"), "utf8");
const journalCardV2Workflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "journal-card-v2.yml"), "utf8");
const youtubeUploaderSource = readFileSync(path.join(process.cwd(), "lib", "youtube", "uploadBroadcastVideo.ts"), "utf8");
const meetingWatchMetadataSource = readFileSync(path.join(process.cwd(), "lib", "youtube", "meetingWatchMetadata.ts"), "utf8");
assert.doesNotMatch(meetingWatchMetadataSource, /no fabricated claims/i);
assert.match(youtubeUploaderSource, /no fabricated claims/);
assert.match(weekdayReleaseSource, /STATION_NEW_PROGRAMS_PER_WEEKDAY/);
assert.match(weekdayReleaseSource, /7 \* 60 \+ 15/);
assert.match(weekdayReleaseSource, /17 \* 60 \+ 10/);
assert.match(weekdayReleaseSource, /eligibleNextDayDeck/);
assert.match(weekdayReleaseSource, /minimumSubstantiveCards\("journal30", "station-program"\)/);
assert.match(weekdayReleaseSource, /eligibleDeck\.cards\.length < requiredCards/);
assert.match(weekdayReleaseSource, /orderedCadenceJournals/);
assert.match(weekdayReleaseSource, /\[14, 21, 28, 35\]/);
assert.match(weekdayReleaseSource, /program\.journalId === journal\.id/);
assert.match(weekdayReleaseWorkflow, /max-parallel: 1/);
assert.match(weekdayReleaseWorkflow, /TARGET=\$\(date -u \+%F\)/);
assert.doesNotMatch(weekdayReleaseWorkflow, /HOUR.*!=.*22/);
const weekdayActivationWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-activate.yml"), "utf8");
assert.match(weekdayActivationWorkflow, /10#\$HOUR.*-lt 7/);
assert.doesNotMatch(weekdayActivationWorkflow, /HOUR.*!=.*06/);
assert.match(weekdayReleaseWorkflow, /youtube_publish_at: \$\{\{ matrix\.program\.youtube_publish_at \}\}/);
assert.match(stationProgramWorkflow, /youtube_publish_at:[\s\S]*default: ""/);
assert.equal(
  [...stationProgramWorkflow.matchAll(/^      youtube_publish_at:/gm)].length,
  2,
  "Both workflow_call and workflow_dispatch must accept youtube_publish_at"
);
assert.match(prepareWeekdayStationSource, /journalsAlreadyReservedThisWeek/);
assert.match(prepareWeekdayStationSource, /cardsAlreadyReservedThisWeek/);
assert.match(prepareWeekdayStationSource, /weeklyDiversityOrder/);
assert.match(prepareWeekdayStationSource, /schedule\.scheduleDate < targetDate/);
assert.match(prepareWeekdayStationSource, /reusedExistingReservation: true/);
assert.match(prepareWeekdayStationSource, /program\.status !== "verified" \|\| !program\.youtubeVideoId/);
assert.match(journalCardV2Workflow, /cron: "0 1 \* \* 1-5"/);
assert.match(journalCardV2Workflow, /github\.event_name == 'schedule'[\s\S]*JOURNAL_CARD_V2_MAX_CARDS/);
assert.match(youtubeUploaderSource, /privacyStatus: publishAt \? "private" : "public"/);
assert.match(youtubeUploaderSource, /publishAt\?: string/);
const twoDailyReleaseMigration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260808190000_two_daily_journal_releases.sql"), "utf8");
assert.match(twoDailyReleaseMigration, /new_youtube_videos', 2[\s\S]*unused_cards_preserved', true/);
assert.match(twoDailyReleaseMigration, /exactly two new journal releases per day/);
const journalCadenceSource = readFileSync(path.join(process.cwd(), "lib", "station", "journalCadence.ts"), "utf8");
assert.match(journalCadenceSource, /TOP_JOURNAL_RELEASE_CADENCE/);
assert.match(journalCadenceSource, /TOP_JOURNAL_FALLBACK_ORDER/);
assert.match(journalCadenceSource, /MAX_ARTICLE_AGE_DAYS = 14/);
assert.match(journalCadenceSource, /date < targetDate/);
const weekdayWheelSource = readFileSync(path.join(process.cwd(), ".github", "workflows", "weekday-station-wheel.yml"), "utf8");
assert.match(weekdayWheelSource, /uses: \.\/\.github\/workflows\/station-program\.yml/);
assert.match(weekdayWheelSource, /prepare-weekday-station/);
const uploadBroadcastVideoSource = readFileSync(
  path.join(process.cwd(), "lib", "youtube", "uploadBroadcastVideo.ts"),
  "utf8"
);
assert.match(uploadBroadcastVideoSource, /downloadYoutubeThumbnail/);
assert.match(uploadBroadcastVideoSource, /params\.append\("journalName", name\)/);
assert.match(uploadBroadcastVideoSource, /params\.set\("journalCount"/);
assert.match(uploadBroadcastVideoSource, /uploadType=resumable&part=snippet,status/);
// Scheduled publication is explicit and opt-in for the automatic weekday
// wheel. Manual/admin callers omit publishAt and remain public immediately.
assert.match(uploadBroadcastVideoSource, /privacyStatus: publishAt \? "private" : "public"/);
assert.match(uploadBroadcastVideoSource, /publishAt\?: string/);
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
// general_social Ã¢â‚¬â€ meaning all X conference fallback cards were invisible
// to "create 1 hour batch cards".
// Note: these cards do NOT have weekly_source_context Ã¢â‚¬â€ that flag is only
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

// 2. Conference context shells (buildConferenceContextItem output Ã¢â€ â€™ buildBatchSegment)
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
assert.equal(
  isJournalVerticalSegment(
    {
      ...realClinicalCard,
      citations: realClinicalCard.citations.map((citation) => ({ ...citation, journalId: selectedJournal.id }))
    },
    new Set([selectedJournal.id])
  ),
  true,
  "A catalog-linked journal card must enter the Journal approval vertical"
);
assert.equal(
  isJournalVerticalSegment(sourceAnnouncementCard, new Set([selectedJournal.id])),
  false,
  "A newspaper card must never enter the Journal approval vertical"
);
assert.equal(
  isJournalVerticalSegment(journalAnnouncementCard, new Set([selectedJournal.id])),
  false,
  "A card without a catalog journal citation must never enter the Journal approval vertical"
);
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
assert.match(dbSource, /const pagesPerBatch = 10/);
assert.match(dbSource, /entire historical approved inventory \(9,000\+ rows/);
assert.match(
  readFileSync(path.join(process.cwd(), "supabase/migrations/20260726125730_admin_segment_status_created_index.sql"), "utf8"), /segments_status_created_at_idx/
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

  const breakingPaper = parsePaperHtml(`
  <html><head>
    <meta name="citation_title" content="A randomized breast cancer trial">
    <meta name="citation_journal_title" content="Journal of Clinical Oncology">
    <meta name="citation_abstract" content="Background: Treatment options remain limited. Methods: Patients were randomized to therapy or control. Results: Progression-free survival improved in the therapy group. Discussion: The authors concluded that benefit should be balanced against toxicity.">
  </head></html>`, "https://pubmed.ncbi.nlm.nih.gov/12345678/");
assert.equal(breakingPaper.diseaseType, "Breast Cancer");
assert.equal(breakingPaper.title, "A randomized breast cancer trial");
const pubmedPaper = parsePubMedXml(`<PubmedArticle><Article><Journal><Title>Neurology</Title></Journal><ArticleTitle>A stroke prevention trial</ArticleTitle><Abstract><AbstractText Label="METHODS">Adults were randomized to intervention or control.</AbstractText><AbstractText Label="RESULTS">Stroke incidence was reduced in the intervention group.</AbstractText><AbstractText Label="CONCLUSIONS">The authors reported a lower stroke incidence.</AbstractText></Abstract></Article></PubmedArticle>`, "https://pubmed.ncbi.nlm.nih.gov/12345678/");
assert.equal(pubmedPaper.diseaseType, "Neurologic Disease");
assert.match(pubmedPaper.script, /Adults were randomized/);
assert.match(breakingPaper.script, /Clinical Evidence Brief: Breaking Paper/);
assert.match(breakingPaper.script, /Methods: Patients were randomized/);
assert.equal(breakingPaper.socialReaction, undefined);
assert.throws(() => assertSafePaperUrl("http://localhost/paper"), /public HTTPS|Private or local/);
const breakingPaperRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "admin", "breaking-paper", "route.ts"), "utf8");
assert.match(breakingPaperRouteSource, /assertAdminRequest/);
assert.match(breakingPaperRouteSource, /fetchBreakingPaper/);
assert.doesNotMatch(breakingPaperRouteSource, /openai|generateText|chat\.completions/i);
// Feature added 2026-07-30: an optional operator-pasted X/Twitter reaction
// (no X API call -- stays zero-cost) is spliced into the deterministic
// script as a clearly attributed extra beat, never mixed into the paper's
// own Background/Methods/Results/Discussion facts.
const breakingPaperWithReaction = parsePaperHtml(`
  <html><head>
    <meta name="citation_title" content="A randomized breast cancer trial">
    <meta name="citation_journal_title" content="Journal of Clinical Oncology">
    <meta name="citation_abstract" content="Background: Treatment options remain limited. Methods: Patients were randomized to therapy or control. Results: Progression-free survival improved in the therapy group. Discussion: The authors concluded that benefit should be balanced against toxicity.">
  </head></html>`, "https://pubmed.ncbi.nlm.nih.gov/12345678/", '  This trial could change practice overnight!! <b>huge</b> if confirmed  ');
assert.match(breakingPaperWithReaction.script, /Also making the rounds on X: "This trial could change practice overnight!! huge if confirmed"/);
assert.ok(breakingPaperWithReaction.script.indexOf("Also making the rounds on X") > breakingPaperWithReaction.script.indexOf("Discussion:"));
assert.ok(breakingPaperWithReaction.script.indexOf("Also making the rounds on X") < breakingPaperWithReaction.script.indexOf("This broadcast is educational"));
assert.match(breakingPaperWithReaction.socialReaction ?? "", /Also making the rounds on X/);
const breakingPaperLongReaction = parsePaperHtml(`
  <html><head>
    <meta name="citation_title" content="A randomized breast cancer trial">
    <meta name="citation_journal_title" content="Journal of Clinical Oncology">
    <meta name="citation_abstract" content="Background: Treatment options remain limited. Methods: Patients were randomized to therapy or control. Results: Progression-free survival improved in the therapy group. Discussion: The authors concluded that benefit should be balanced against toxicity.">
  </head></html>`, "https://pubmed.ncbi.nlm.nih.gov/12345678/", "x".repeat(600));
assert.match(breakingPaperLongReaction.socialReaction ?? "", /…"$/);
const breakingPaperDeskSource = readFileSync(path.join(process.cwd(), "components", "BreakingPaperDesk.tsx"), "utf8");
assert.match(breakingPaperDeskSource, /socialReaction/);
assert.match(breakingPaperDeskSource, /no X API call/);
console.log("Broadcast guard verification passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert.equal(minimumSubstantiveCards("presentation"), 6);
assert.equal(minimumSubstantiveCards("journal30"), 8);
assert.equal(minimumSubstantiveCards("journal30", "station-program"), 12);
assert.equal(minimumSubstantiveCards("weekend30"), 12);
assert.equal(minimumSubstantiveCards("breaking15"), 1);
assert.throws(
  () => assertMinimumSubstantiveCards({
    mode: "presentation",
    cards: [{ duration: 60, isMusic: false, segmentId: "only-card" }]
  }),
  /1 substantive source-backed card.*6 are required/
);
assert.equal(
  assertMinimumSubstantiveCards({
    mode: "presentation",
    cards: Array.from({ length: 6 }, (_, index) => ({ duration: 60, isMusic: false, segmentId: `card-${index}` }))
  }),
  6
);
assert.deepEqual(parseVolumeDetect("mean_volume: -21.4 dB\nmax_volume: -3.0 dB"), { meanVolumeDb: -21.4, maxVolumeDb: -3 });
assert.equal(parseVolumeDetect("mean_volume: -inf dB\nmax_volume: -inf dB").maxVolumeDb, Number.NEGATIVE_INFINITY);

{
  const makeTrial = (id: string, title: string, trial: string): Segment => ({
    id, title, summary: title, script: title, contentType: "media_roundup", personaId: "echo-sage", personaName: "TumorCrusher",
    hypeLevel: "restrained", language: "English", status: "approved", citations: [{ label: "Source", url: "https://example.com/article", sourceType: "media" }],
    socialBuzzItems: [], riskFlags: ["meeting_watch", `meeting_trial:${trial}`], confidenceScore: 95, createdAt: "2026-07-28T00:00:00.000Z"
  });
  const ordered = groupMeetingWatchSegmentsByTrial([
    makeTrial("a1", "Trial A: design", "a"), makeTrial("b1", "Trial B: design", "b"), makeTrial("a2", "Trial A: results", "a")
  ]);
  assert.deepEqual(ordered.map((segment) => segment.id), ["a1", "a2", "b1"]);
}
{
  const trialNames = ["TRIANGLE", "BRUIN", "TRIANGLE", "MajesTEC", "ALPINE", "SEQUOIA"];
  const preparedPackage = {
    schema_version: "conferencehype_prepared_broadcast_v1", status: "ready", content_type: "CONFERENCE_ROUNDUP",
    source: { publication: "Example Journal", article_title: "ASH review", url: "https://example.com/ash-review", publication_date: "2026-07-01", authors: ["Ada Author"] },
    program: { conference_name: "ASH", specialty: "Hematology", title: "ASH trial review", thumbnail_headline: "What changed?", description_opening: "A evidence-based review.", studies_covered: trialNames, estimated_spoken_words: 300, estimated_duration_minutes: 5, recommended_presenter_format: "two hosts" },
    opening_hook: { visible_text: "The key findings", speaker_turns: [{ speaker: "HOST_1", text: "TumorCrusher / Media Watch: A new ASCO Educational Book review. Here is the review." }], source_anchor: "Opening" },
    cards: trialNames.map((study_name, index) => ({ position: index + 1, title: `${study_name}: finding ${index + 1}`, card_type: "evidence", visible_text: `Finding ${index + 1}`, speaker_turns: [{ speaker: index % 2 ? "HOST_2" : "HOST_1", text: `Discussion for ${study_name}.` }], source_anchor: `Paragraph ${index + 1}`, study_name, reported_numbers: [], limitations: [] })),
    transitions: [{ after_card_position: 1, duration_seconds: 20, next_topic: "BRUIN" }],
    disclaimer: { after_card_position: 4, text: "This is commentary, not medical advice." },
    closing: { speaker_turns: [{ speaker: "HOST_1", text: "That concludes the review." }] }, chapters: [], youtube_tags: [], quality_report: {}
  };
  const normalized = parsePreparedNarrative(JSON.stringify(preparedPackage));
  assert.equal(normalized.trialOrderNormalized, true);
  assert.deepEqual(normalized.package.cards.slice(0, 2).map((card) => card.study_name), ["TRIANGLE", "TRIANGLE"]);
  const normalizedSegments = preparedNarrativeSegments(normalized.package);
  const firstTriangleEnd = normalizedSegments.findLast((segment) => segment.riskFlags.includes("prepared_study:triangle"));
  assert.ok(firstTriangleEnd?.riskFlags.includes("prepared_transition:20"));
  assert.ok(!normalizedSegments.find((segment) => segment.riskFlags.includes("prepared_study:triangle") && segment.riskFlags.includes("prepared_transition:20") && segment.title.endsWith("finding 1")));
  assert.match(normalizedSegments[0].script, /^We are reviewing "ASH review" by Ada Author, published in Example Journal\./);
  assert.doesNotMatch(normalizedSegments.map((segment) => segment.script).join(" "), /TumorCrusher \/ Media Watch|A new ASCO Educational Book review/i);
  assert.equal(normalizedSegments.filter((segment) => segment.riskFlags.includes("prepared_disclaimer")).length, 1);
  const preparedSlots = buildMeetingWatchSlots({
    segments: normalizedSegments,
    baseTime: new Date("2026-07-29T13:00:00.000Z"),
    meetingWatchBroadcastId: "prepared-test",
    meetingLabel: "ASH review",
    showSeconds: normalized.durationSeconds
  });
  assert.equal(preparedSlots.at(-1)?.kind, "music");
  assert.equal(preparedSlots.at(-1)?.durationSeconds, 15);
  assert.match(preparedSlots.at(-1)?.label ?? "", /Like, subscribe, and recommend/);
}
