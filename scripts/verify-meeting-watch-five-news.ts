import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePreparedNarrative, preparedNarrativeSegments } from "@/lib/meetingWatch/preparedNarrative";
import { buildMeetingWatchSlots } from "@/lib/rundown/meetingWatchSlots";
import { buildMeetingWatchMetadata } from "@/lib/youtube/meetingWatchMetadata";
import { cleanMeetingWatchCopy } from "@/lib/meetingWatch/packaging";
import { assertMeetingWatchFiveNewsComplete, minimumSubstantiveCards } from "@/lib/media/broadcastQuality";

const narration = "The official primary source reports a meeting update with a defined population, intervention, comparator, endpoint, numerical result, safety context, and follow-up. Clinicians should review eligibility criteria, absolute effects, limitations, and the complete abstract before interpreting the finding. The company attribution is included only because the official source explicitly identifies the sponsor or developer. This recap distinguishes the reported result from interpretation and avoids extending the evidence beyond the population and follow-up described by investigators.";
const packageJson = {
  schema_version: "conferencehype_meeting_watch_five_news_v1",
  status: "ready",
  meeting: { name: "ESC Congress", year: 2026, dates: "August 28-31, 2026", specialty: "Cardiology", specialist_alert: "CARDIOLOGIST ALERT", eye_catching_topic: "Five Hot Trials From Novartis and AstraZeneca" },
  news_items: Array.from({ length: 5 }, (_, index) => ({ position: index + 1, headline: `Complete meeting headline ${index + 1}`, visible_text: `Key source-supported result ${index + 1}`, narration, primary_source_url: `https://example.com/abstract-${index + 1}`, source_label: `ESC abstract ${index + 1}`, abstract_number: `Abstract ${100 + index}`, study_name: `TRIAL-${index + 1}`, pharma_companies: index < 2 ? [index === 0 ? "Novartis" : "AstraZeneca"] : [], reported_numbers: ["42 percent"], limitations: ["Follow-up remains limited"] })),
  disclaimer: "This medical meeting recap is for educational and informational purposes only and is not individualized medical advice.",
  closing: "ESC Congress 2026 ran August 28-31, 2026. Comment with the abstract or company update we should cover next and subscribe.",
  quality_report: { exactly_five_news_items: true }
};

const parsed = parsePreparedNarrative(JSON.stringify(packageJson));
assert.equal(parsed.package.cards.length, 5);
assert.equal(parsed.package.program.conference_name, "ESC Congress 2026");
assert.match(parsed.package.program.title, /^ESC Congress 2026 \| CARDIOLOGIST ALERT:/);
assert.match(parsed.package.program.title, /Novartis.*AstraZeneca/);
assert.ok(parsed.package.program.title.length <= 150);
assert.ok(parsed.package.program.thumbnail_headline.length <= 120);
const segments = preparedNarrativeSegments(parsed.package);
assert.equal(segments.filter((segment) => segment.riskFlags.includes("meeting_watch_five_news")).length, 5);
assert.equal(new Set(segments.filter((segment) => segment.riskFlags.includes("meeting_watch_five_news")).map((segment) => segment.citations[0]?.url)).size, 5);
const slots = buildMeetingWatchSlots({ segments, baseTime: new Date("2026-08-30T12:00:00Z"), meetingWatchBroadcastId: "five-news-test", meetingLabel: "ESC Congress 2026", showSeconds: parsed.durationSeconds });
const metadata = buildMeetingWatchMetadata({ hourStart: new Date("2026-08-30T12:00:00Z"), slots, title: parsed.package.program.title, meetingLabel: "ESC Congress 2026", specialty: "Cardiology", sourceUrl: packageJson.news_items[0].primary_source_url, descriptionOpening: parsed.package.program.description_opening });
assert.match(metadata.title, /^ESC Congress 2026 \| CARDIOLOGIST ALERT:/);
assert.equal(metadata.meetingLabel, "ESC Congress 2026");
assert.equal(metadata.specialistAlert, "CARDIOLOGIST ALERT");
assert.equal(metadata.meetingDates, "August 28-31, 2026");
assert.match(segments[0].script, /ESC Congress 2026, held August 28-31, 2026/);
assert.match(metadata.thumbnailEntity ?? "", /Novartis.*AstraZeneca/);
assert.doesNotMatch([metadata.title, metadata.description, metadata.thumbnailHeadline].join(" "), /Clinical Evidence Brief|New Evidence|The Story Behind the Result|Why This Result Matters/i);
assert.equal(cleanMeetingWatchCopy("Clinical Evidence Brief: New Evidence — Why This Result Matters"), "");
const edited = parsePreparedNarrative(JSON.stringify(packageJson), { title: "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Practice-Changing Trials", thumbnailStatement: "FIVE PRACTICE-CHANGING TRIALS" });
assert.equal(edited.package.program.title, "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Practice-Changing Trials");
assert.equal(edited.package.program.thumbnail_headline, "FIVE PRACTICE-CHANGING TRIALS");
assert.notEqual(edited.sourceHash, parsed.sourceHash);
assert.throws(() => parsePreparedNarrative(JSON.stringify(packageJson), { title: "Five Practice-Changing Trials", thumbnailStatement: "FIVE PRACTICE-CHANGING TRIALS" }), /must start with ESC Congress 2026/);
assert.throws(() => parsePreparedNarrative(JSON.stringify(packageJson), { title: "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Trials", thumbnailStatement: "Clinical Evidence Brief" }), /generic evidence labels/);
assert.equal(minimumSubstantiveCards("meetingWatchFiveNews"), 5);
const completeCards = segments.map((segment) => ({ duration: 60, isMusic: false, segmentId: segment.id, riskFlags: segment.riskFlags }));
assert.deepEqual(assertMeetingWatchFiveNewsComplete(completeCards), { sourcedNewsItems: 5, hasDisclaimer: true, hasClosing: true });
assert.throws(() => assertMeetingWatchFiveNewsComplete(completeCards.filter((card) => !card.riskFlags.includes("prepared_disclaimer"))), /incomplete story/);

const storyNarration = `${narration} ${narration}`;
const storyPackage = {
  ...packageJson,
  schema_version: "conferencehype_meeting_watch_story_v2",
  story: {
    thesis: "The five trials collectively test whether cardiovascular benefit can move earlier while becoming more precisely targeted.",
    opening_hook: storyNarration,
    closing_synthesis: storyNarration
  },
  news_items: packageJson.news_items.map((item, index) => ({
    ...item,
    bridge_from_previous: index === 0 ? "That question begins with the meeting's first major trial." : "The next finding carries that same clinical question into another population.",
    narration: storyNarration
  })),
  closing: undefined
};
const parsedStory = parsePreparedNarrative(JSON.stringify(storyPackage));
assert.equal(parsedStory.package.cards.length, 5);
assert.equal(parsedStory.package.transitions.length, 0);
assert.equal(parsedStory.transitionSeconds, 0);
assert.match(parsedStory.package.opening_hook.speaker_turns[0].text, /^ESC Congress 2026, held August 28-31, 2026\./);
assert.match(parsedStory.package.opening_hook.speaker_turns[0].text, /five trials collectively test/);
assert.match(parsedStory.package.cards[1].speaker_turns[0].text, /^The next finding carries/);
assert.doesNotMatch(parsedStory.package.cards.map((card) => card.speaker_turns[0].text).join(" "), /Number (?:one|two|three|four|five)/i);
assert.match(parsedStory.package.closing.speaker_turns[0].text, /ESC Congress 2026/);
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...storyPackage, story: undefined })), /continuous-story package requires/);
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...storyPackage, news_items: storyPackage.news_items.map((item, index) => index === 1 ? { ...item, bridge_from_previous: "Next." } : item) })), /narrative bridge/);
const oversizedTopic = parsePreparedNarrative(JSON.stringify({ ...storyPackage, meeting: { ...storyPackage.meeting, eye_catching_topic: "A complete but intentionally oversized Claude topic ".repeat(5).trim() } }));
assert.ok(oversizedTopic.package.program.title.length <= 150);
assert.ok(oversizedTopic.package.program.thumbnail_headline.length <= 120);
assert.match(oversizedTopic.package.program.thumbnail_headline, /Novartis.*AstraZeneca/);

const fullNarrativeAbstract = "This trial enrolled a defined respiratory population and tested a targeted intervention against the stated comparator. The primary source reports the key clinical result with appropriate uncertainty, while follow-up and generalizability remain important limitations for physicians interpreting the abstract.";
const fullNarrativePackage = {
  schema_version: "conferencehype_meeting_watch_full_narrative_v3", status: "ready",
  meeting: { name: "ERS Congress", year: 2026, dates: "September 5-9, 2026", specialty: "Respiratory Medicine", specialist_alert: "PULMONOLOGIST ALERT", eye_catching_topic: "AstraZeneca, GSK and Boehringer Lead ERS Respiratory Updates" },
  opening_hook: "ERS Congress 2026 brings AstraZeneca, GSK, and Boehringer Ingelheim into one respiratory story: targeted inflammation in COPD and asthma, alongside new approaches to progressive pulmonary fibrosis. The next ten abstracts show where these strategies produced clinical signals and where important uncertainty remains.",
  abstracts: Array.from({ length: 10 }, (_, index) => ({ position: index + 1, headline: `Complete ERS abstract headline ${index + 1}`, visible_text: `Source-supported ERS result ${index + 1}`, narration: fullNarrativeAbstract, primary_source_url: `https://example.com/ers-abstract-${index + 1}`, source_label: `Official ERS abstract ${index + 1}`, abstract_number: `Abstract ${200 + index}`, study_name: `ERS-TRIAL-${index + 1}`, pharma_companies: index === 0 ? ["AstraZeneca"] : index === 1 ? ["GSK"] : index === 2 ? ["Boehringer Ingelheim"] : [], reported_numbers: ["Source-supported result"], limitations: ["Follow-up remains limited"] })),
  disclaimer: "This educational meeting summary is not medical advice; clinicians should review each complete abstract before applying its findings.",
  closing: "ERS Congress 2026, held September 5-9, shows respiratory precision medicine advancing across inflammation and fibrosis, but comparative effectiveness remains unresolved. Review the linked abstracts, comment on what matters most, and subscribe for the next meeting briefing.",
  quality_report: { complete_beginning_to_end_narration: true }
};
const fullNarrative = parsePreparedNarrative(JSON.stringify(fullNarrativePackage));
assert.equal(fullNarrative.package.cards.length, 10);
assert.ok(fullNarrative.durationSeconds <= 600);
const fullNarrativeSegments = preparedNarrativeSegments(fullNarrative.package);
assert.equal(fullNarrativeSegments[0].script, fullNarrativePackage.opening_hook);
assert.equal(fullNarrativeSegments.filter((segment) => segment.riskFlags.includes("meeting_watch_narrative_abstract")).length, 10);
assert.equal(fullNarrativeSegments.filter((segment) => segment.riskFlags.some((flag) => flag === "prepared_transition:20")).length, 11);
assert.equal(fullNarrativeSegments.filter((segment) => segment.riskFlags.includes("prepared_closing")).length, 1);
assert.equal(fullNarrativeSegments.filter((segment) => segment.riskFlags.includes("prepared_disclaimer")).length, 1);
assert.equal(fullNarrativeSegments.at(-1)?.script, `${fullNarrativePackage.disclaimer} ${fullNarrativePackage.closing}`);
const fullNarrativeSlots = buildMeetingWatchSlots({ segments: fullNarrativeSegments, baseTime: new Date("2026-09-01T12:00:00Z"), meetingWatchBroadcastId: "full-narrative-test", meetingLabel: "ERS Congress 2026", showSeconds: fullNarrative.durationSeconds });
const fullNarrativeMusic = fullNarrativeSlots.filter((slot) => slot.kind === "music");
assert.equal(fullNarrativeMusic.length, 12);
assert.ok(fullNarrativeMusic.slice(0, -1).every((slot) => slot.durationSeconds === 20));
assert.equal(fullNarrativeMusic.at(-1)?.durationSeconds, 15);
const fullNarrativeCards = fullNarrativeSegments.map((segment) => ({ duration: 45, isMusic: false, segmentId: segment.id, riskFlags: segment.riskFlags }));
assert.deepEqual(assertMeetingWatchFiveNewsComplete(fullNarrativeCards), { sourcedNewsItems: 10, hasDisclaimer: true, hasClosing: true });
const expandedOpeningHook = `${fullNarrativePackage.opening_hook} Across the program, clinicians will hear how trial design, patient selection, dosing convenience, biomarker strategy, safety findings, and practical uncertainty shape the interpretation of these respiratory programs. The goal is to connect company pipelines with the clinical questions physicians face, while separating encouraging signals from evidence that still requires confirmation in larger or longer studies. Together, these reports frame a meeting centered on precision treatment without losing sight of implementation.`;
assert.ok(expandedOpeningHook.split(/\s+/).filter(Boolean).length <= 120);
const fiveAbstractPackage = { ...fullNarrativePackage, opening_hook: expandedOpeningHook, abstracts: fullNarrativePackage.abstracts.slice(0, 5) };
assert.doesNotThrow(() => parsePreparedNarrative(JSON.stringify(fiveAbstractPackage)));
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...fiveAbstractPackage, opening_hook: `${expandedOpeningHook} ${"excess ".repeat(121)}` })), /30-120 spoken words/);
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...fullNarrativePackage, abstracts: [...fullNarrativePackage.abstracts, { ...fullNarrativePackage.abstracts[0], position: 11, primary_source_url: "https://example.com/ers-abstract-11" }] })), /at most 10|Too big/i);

const thumbnailSource = readFileSync(path.resolve("app/api/youtube-thumbnail/route.tsx"), "utf8");
const renderSource = readFileSync(path.resolve("scripts/render-hour-broadcast.ts"), "utf8");
const meetingWatchDeskSource = readFileSync(path.resolve("components/MeetingWatchDesk.tsx"), "utf8");
const meetingWatchPublishSource = readFileSync(path.resolve("app/api/admin/meeting-watch/prepared/publish/route.ts"), "utf8");
assert.match(thumbnailSource, /if \(isMeetingWatch && seriesLabel\)/);
assert.match(thumbnailSource, /isMeetingWatch \? detailLabel \?\? seriesLabel : date/);
assert.match(renderSource, /meetingWatch: isMeetingWatchMode/);
assert.match(renderSource, /cleanMeetingWatchCopy\(card\.script\)/);
assert.match(renderSource, /Meeting Watch full-narrative music gate failed/);
assert.match(meetingWatchDeskSource, /Develop and publish YouTube video/);
assert.doesNotMatch(meetingWatchDeskSource, /Validate and preview/);
assert.match(meetingWatchPublishSource, /title: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(150\)\.optional\(\)/);
console.log("Meeting Watch five-news verification passed.");
